import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ComponentInstance } from '@/types/components';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { DeckStatus } from '@/types/DeckTypes';
import { cn } from '@/lib/utils';
import MiniSlide from './MiniSlide';
import SlideGeneratingUI from '../common/SlideGeneratingUI';

// NEW ThumbnailItem component
interface ThumbnailItemProps {
  slide: SlideData;
  index: number;
  currentSlideIndex: number;
  isTransitioning: boolean; // Keep or remove if not needed by motion?
  draggedIndex: number | null;
  handleThumbnailClick: (index: number) => void;
  handleDeleteSlide: (slideId: string, slideIndex: number) => Promise<void>;
  handleDuplicateSlide: (slideId: string, slideIndex: number) => Promise<void>;
  handleNewSlide: (slideId: string, slideIndex: number) => Promise<void>;
  handleDragStart: (index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, destinationIndex: number) => Promise<void>;
  handleDragEnd: () => void;
  deckStatus?: DeckStatus; // Add deckStatus prop
  isNewDeck?: boolean;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  slide,
  index,
  currentSlideIndex,
  draggedIndex,
  handleThumbnailClick,
  handleDeleteSlide,
  handleDuplicateSlide,
  handleNewSlide,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  deckStatus,
  isNewDeck
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Don't compute background during generation - it causes blue thumbnails
  const fallbackBackground = useMemo(() => {
    // Only show background if slide has real content (not just background component)
    const hasRealContent = slide?.components?.some(
      (comp: any) => comp.type !== 'Background' && !comp.id?.toLowerCase().includes('background')
    );
    
    if (!hasRealContent) {
      return undefined; // No background during generation
    }
    
    try {
      const bg = slide?.components?.find(
        (comp: any) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
      );
      if (!bg) return undefined;
      const props: any = bg.props || {};
      
      // Check for gradient object first (support stops or colors alias)
      if (props.gradient && typeof props.gradient === 'object') {
        const gradient: any = props.gradient;
        const rawStops = Array.isArray(gradient.stops) ? gradient.stops : (Array.isArray(gradient.colors) ? gradient.colors : []);
        if (rawStops.length > 0) {
          const stops = rawStops
            .filter((s: any) => s && s.color)
            .map((s: any, idx: number) => {
              let position = s.position;
              // Default positions if missing
              if (position === undefined || position === null || isNaN(position)) {
                position = (idx / Math.max(1, rawStops.length - 1)) * 100;
              }
              // Convert 0-1 range to percentage if needed
              if (position <= 1 && rawStops.every((stop: any) => (stop.position ?? 0) <= 1)) {
                position = position * 100;
              }
              return `${s.color} ${position}%`;
            })
            .join(', ');
        
          if (!stops) return undefined;
        
          if (gradient.type === 'radial') {
            return `radial-gradient(circle, ${stops})`;
          }
          const angle = gradient.angle !== undefined ? gradient.angle : 135;
          return `linear-gradient(${angle}deg, ${stops})`;
        }
      }
      
      // Check for string gradient/background
      if (typeof props.gradient === 'string' && props.gradient) return props.gradient;
      if (typeof props.background === 'string' && props.background) return props.background;
      if (props.style?.background) return props.style.background;
      
      // Fall back to solid color
      const directColor = props.backgroundColor || props.color || props.page?.backgroundColor;
      if (typeof directColor === 'string' && directColor) return directColor;
    } catch {}
    return undefined;
  }, [slide]);

  // Fixed context menu implementation using the imported components
  // Use index as key for stability during generation when IDs might change
  const stableKey = `thumbnail-${index}`;
  
  return (
    <ContextMenu>
        <ContextMenuTrigger>
          <div
            ref={itemRef}
            className={`
              slide-thumbnail w-40 h-24 rounded flex-shrink-0 cursor-pointer transition-all relative
              ${index === currentSlideIndex
                ? 'border-2 border-primary shadow-sm'
                : 'border border-border hover:border-primary/50'}
              ${draggedIndex === index ? 'opacity-50' : ''}
            `}
            draggable={true}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle icon */}
            <div 
              className="absolute top-1 right-1 z-40 opacity-30 hover:opacity-100 transition-opacity cursor-grab" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <GripVertical className="h-4 w-4 text-foreground" />
            </div>

            {/* Slide number - simple dark grey text */}
            <div className="absolute -top-5 w-full text-center text-[10px] text-gray-500 z-40">
              {index + 1}
            </div>
            
            {/* Clickable overlay that covers entire thumbnail */}
            <div 
              className="absolute inset-0 z-30 cursor-pointer" 
              onClick={() => handleThumbnailClick(index)} 
              style={{ background: 'transparent' }}
            ></div>
            
            {/* Main thumbnail content */}
            <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-sm"
                 style={fallbackBackground ? { background: fallbackBackground } : {}}>
              {/* Stable thumbnail rendering */}
              {(() => {
                // Check if slide has real content (not just background)
                const hasRealContent = slide.components?.some(
                  (c: any) => c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
                );
                
                if (hasRealContent) {
                  return (
                    <MiniSlide 
                      slide={slide}
                      width={160}
                      height={90}
                      responsive={false}
                    />
                  );
                }
                
                // Show placeholder for slides without real content
                return (
                  <div className="w-full h-full rounded-sm overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
                        Slide {index + 1}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => handleNewSlide(slide.id, index)}>
            <Plus className="mr-2 h-4 w-4" />
            New Slide
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleDuplicateSlide(slide.id, index)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate Slide
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleDeleteSlide(slide.id, index)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Slide
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
  );
};
// END NEW ThumbnailItem component

interface ThumbnailNavigatorProps {
  slides: SlideData[];
  currentSlideIndex: number;
  onThumbnailClick: (index: number) => void;
  isTransitioning: boolean;
  onSlideDelete?: (slideId: string) => void;
  deckStatus?: DeckStatus;
  isNewDeck?: boolean;
}

const ThumbnailNavigator: React.FC<ThumbnailNavigatorProps> = ({
  slides,
  currentSlideIndex,
  onThumbnailClick,
  isTransitioning,
  onSlideDelete,
  deckStatus,
  isNewDeck
}) => {
  // Get slide operations from the deckStore
  const removeSlide = useDeckStore(state => state.removeSlide);
  const duplicateSlide = useDeckStore(state => state.duplicateSlide);
  const addSlideAfter = useDeckStore(state => state.addSlideAfter);
  const addSlide = useDeckStore(state => state.addSlide);
  const reorderSlides = useDeckStore(state => state.reorderSlides);
  
  // Use stable slide references to prevent unnecessary re-renders
  const displaySlides = React.useMemo(() => {
    // Return slides without modification - they're already stable from the store
    return slides || [];
  }, [slides]);
  
  const totalSlides = displaySlides.length;
  const { toast } = useToast();
  
  // State for drag and drop
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Track if we should show the stacked animation (only on first mount during generation)
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false);
  const isInitializing = deckStatus?.state === 'creating' && !hasAnimatedIn;
  
  // Trigger animation when transitioning from creating to generating
  React.useEffect(() => {
    if (deckStatus?.state === 'generating' && !hasAnimatedIn) {
      setHasAnimatedIn(true);
    }
  }, [deckStatus?.state, hasAnimatedIn]);
  
  // Throttling for slide operations
  const [lastOperationTime, setLastOperationTime] = useState<number>(0);
  const OPERATION_THROTTLE_MS = 800; // 800ms throttle for slide operations - increased for more reliability

  const handleThumbnailClick = (index: number) => {
    // Ensure the thumbnail click handler is called
    if (typeof onThumbnailClick === 'function') {
      onThumbnailClick(index);
    }
  };
  
  const handleDeleteSlide = async (slideId: string, slideIndex: number) => {
    const now = Date.now();
    // Prevent rapid sequential operations
    if (now - lastOperationTime < OPERATION_THROTTLE_MS) {
      console.log("Operation throttled - please wait before deleting a slide");
      return;
    }
    
    // Update operation timestamp
    setLastOperationTime(now);
    
    // Don't allow deleting the last slide
    if (totalSlides <= 1) {
      // Cannot delete the last slide
      toast({
        title: "Cannot Delete Slide",
        description: "A presentation must have at least one slide.",
        variant: "destructive",
        duration: 3000
      });
      return;
    }
    
    try {
      // Use the removeSlide function from deckStore
      await removeSlide(slideId);
      
      // Notify parent component about the deletion if needed
      if (onSlideDelete) {
        onSlideDelete(slideId);
      }
      
      // Show success toast
      toast({
        title: "Slide Deleted",
        description: `Slide ${slideIndex + 1} has been removed.`,
        duration: 3000
      });
    } catch (error) {
      // Handle slide deletion error
      toast({
        title: "Error Deleting Slide",
        description: "An error occurred while trying to delete the slide.",
        variant: "destructive",
        duration: 3000
      });
    }
  };

  const handleDuplicateSlide = async (slideId: string, slideIndex: number) => {
    const now = Date.now();
    // Prevent rapid sequential operations
    if (now - lastOperationTime < OPERATION_THROTTLE_MS) {
      console.log("Operation throttled - please wait before duplicating a slide");
      return;
    }
    
    // Update operation timestamp
    setLastOperationTime(now);
    
    try {
      // Use the duplicateSlide function from deckStore
      await duplicateSlide(slideId);
      
      // Show success toast (shorter duration)
      toast({
        title: "Slide Duplicated",
        description: `Slide ${slideIndex + 1} has been duplicated.`,
        duration: 1500
      });
    } catch (error) {
      // Handle duplication error
      toast({
        title: "Error Duplicating Slide",
        description: "An error occurred while trying to duplicate the slide.",
        variant: "destructive",
        duration: 3000
      });
    }
  };

  const handleNewSlide = async (slideId: string, slideIndex: number) => {
    const now = Date.now();
    // Prevent rapid sequential operations
    if (now - lastOperationTime < OPERATION_THROTTLE_MS) {
      console.log("Operation throttled - please wait before adding another slide");
      return;
    }
    
    // Update operation timestamp
    setLastOperationTime(now);
    
    try {
      // Use the addSlideAfter function to add a slide after the clicked one
      // The function will fill in all required fields with defaults including title
      await addSlideAfter(slideId);
      
      // Show success toast (shorter duration)
      toast({
        title: "Slide Added",
        description: `A new slide has been added after slide ${slideIndex + 1}.`,
        duration: 1500
      });
    } catch (error) {
      // Handle error adding slide
      toast({
        title: "Error Adding Slide",
        description: "An error occurred while trying to add a new slide.",
        variant: "destructive",
        duration: 1500
      });
    }
  };

  // Note: lastOperationTime and OPERATION_THROTTLE_MS are declared above
  
  const handleAddSlide = () => {
    const now = Date.now();
    // Prevent rapid sequential operations
    if (now - lastOperationTime < OPERATION_THROTTLE_MS) {
      console.log("Operation throttled - please wait before adding another slide");
      return;
    }
    
    // Update operation timestamp
    setLastOperationTime(now);
    
    // Call the addSlide function from deckStore
    // The addSlide utility will handle creating the appropriate background and components based on theme
    // We need to provide all required fields for the Omit<SlideData, 'id'> type
    const deckData = useDeckStore.getState().deckData;
    addSlide({
      title: 'New Slide',
      deckId: deckData.uuid,
      order: deckData.slides.length,
      // Do not pass components to allow default template components to be created
      status: 'completed'
    });
    
    // Show success toast (shorter duration)
    toast({
      title: "New Slide Added",
      description: "A new slide has been added to your deck.",
      duration: 1500
    });
  };
  
  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Provide visual feedback
    const thumbnailElements = document.querySelectorAll('.slide-thumbnail');
    thumbnailElements.forEach((el, i) => {
      if (i === index) {
        el.classList.add('border-dashed', 'border-primary');
      } else {
        el.classList.remove('border-dashed', 'border-primary');
      }
    });
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = async (e: React.DragEvent, destinationIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clean up visual feedback
    const thumbnailElements = document.querySelectorAll('.slide-thumbnail');
    thumbnailElements.forEach(el => {
      el.classList.remove('border-dashed', 'border-primary');
    });
    
    const now = Date.now();
    // Prevent rapid sequential operations
    if (now - lastOperationTime < OPERATION_THROTTLE_MS) {
      console.log("Operation throttled - please wait before reordering slides");
      setDraggedIndex(null); // Reset drag state
      return;
    }
    
    if (draggedIndex !== null && draggedIndex !== destinationIndex) {
      // Update operation timestamp
      setLastOperationTime(now);
      
      try {
        // Reorder slides using the function from deckStore
        await reorderSlides(draggedIndex, destinationIndex);
        
        // Show toast notification
        toast({
          title: "Slides Reordered",
          description: `Slide ${draggedIndex + 1} moved to position ${destinationIndex + 1}.`,
          duration: 3000
        });
        
        // Update current slide index if necessary
        if (currentSlideIndex === draggedIndex) {
          onThumbnailClick(destinationIndex);
        } else if (
          // Handle the case where current slide index needs to be adjusted
          (currentSlideIndex > draggedIndex && currentSlideIndex <= destinationIndex) ||
          (currentSlideIndex < draggedIndex && currentSlideIndex >= destinationIndex)
        ) {
          const newIndex = currentSlideIndex > draggedIndex 
            ? currentSlideIndex - 1 
            : currentSlideIndex + 1;
          onThumbnailClick(newIndex);
        }
      } catch (error) {
        // Handle reordering error
        toast({
          title: "Error Reordering Slides",
          description: "An error occurred while reordering slides.",
          variant: "destructive",
          duration: 3000
        });
      }
    }
    
    // Reset drag state
    setDraggedIndex(null);
  };
  
  const handleDragEnd = () => {
    // Clean up visual feedback
    const thumbnailElements = document.querySelectorAll('.slide-thumbnail');
    thumbnailElements.forEach(el => {
      el.classList.remove('border-dashed', 'border-primary');
    });
    
    // Reset drag state
    setDraggedIndex(null);
  };

  // Reference to the thumbnail container for scrolling
  const thumbnailContainerRef = React.useRef<HTMLDivElement>(null);
  
  // Simple scroll function without using scrollIntoView to prevent unwanted page scrolling
  const scrollThumbnailIntoView = React.useCallback(() => {
    if (!thumbnailContainerRef.current) return;
    
    const container = thumbnailContainerRef.current;
    const thumbnails = container.querySelectorAll('.slide-thumbnail');
    
    if (thumbnails.length <= currentSlideIndex) return;
    
    const thumbnail = thumbnails[currentSlideIndex] as HTMLElement;
    if (!thumbnail) return;
    
    // Calculate the scroll position - position thumbnail in center
    const thumbnailRect = thumbnail.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const thumbnailCenter = thumbnail.offsetLeft + thumbnailRect.width / 2;
    const containerCenter = containerRect.width / 2;
    const scrollPosition = thumbnailCenter - containerCenter;
    
    // Scroll the container directly to avoid page scrolling side effects
    container.scrollLeft = Math.max(0, scrollPosition);
  }, [currentSlideIndex]);
  
  // Only trigger scroll when currentSlideIndex changes
  React.useEffect(() => {
    requestAnimationFrame(scrollThumbnailIntoView);
  }, [currentSlideIndex, scrollThumbnailIntoView]);

  return (
    <div 
      ref={thumbnailContainerRef}
      className="p-4 pt-5 pb-5 flex flex-nowrap items-center gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide max-w-full" 
      style={{ 
        minHeight: '130px', 
        marginTop: 'auto', 
        zIndex: 10,
        scrollbarWidth: 'none', // Firefox
        msOverflowStyle: 'none', // IE/Edge
        overscrollBehavior: 'contain' // Prevent scroll chaining
      }}
      onWheel={(e) => {
        // Use scrollLeft instead of preventDefault to avoid passive listener warnings
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && thumbnailContainerRef.current) {
          thumbnailContainerRef.current.scrollLeft += e.deltaY;
          // Note: we don't call preventDefault as it can trigger warnings with passive listeners
        }
      }}
    >
      {/* Thumbnail grid with responsive layout */}
      <div className={cn(
        "pb-2",
        "scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
      )}>
        <div className="flex gap-2 px-2">
          {displaySlides.map((slide, index) => {
            // Calculate stacked position for initialization
            const stackOffset = isInitializing ? index * 4 : 0;
            const initialX = isInitializing ? -stackOffset : 0;
            
            return (
              <motion.div
                key={`slide-wrapper-${index}`}
                initial={isInitializing ? { 
                  x: initialX,
                  scale: 0.95,
                  opacity: 0.8
                } : false}
                animate={{ 
                  x: 0,
                  scale: 1,
                  opacity: 1
                }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                  delay: isInitializing ? index * 0.1 : 0
                }}
              >
                <ThumbnailItem
                  slide={slide}
                  index={index}
                  currentSlideIndex={currentSlideIndex}
                  isTransitioning={isTransitioning}
                  draggedIndex={draggedIndex}
                  handleThumbnailClick={handleThumbnailClick}
                  handleDeleteSlide={handleDeleteSlide}
                  handleDuplicateSlide={handleDuplicateSlide}
                  handleNewSlide={handleNewSlide}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDragLeave={handleDragLeave}
                  handleDrop={handleDrop}
                  handleDragEnd={handleDragEnd}
                  deckStatus={deckStatus}
                  isNewDeck={isNewDeck}
                />
              </motion.div>
            );
          })}
          
          {/* Show "generating more slides" indicator when deck is still generating but only 1 slide is shown */}
          {/* Temporarily disabled to simplify logic
          {deckStatus && 
           deckStatus.state === 'generating' && 
           deckStatus.totalSlides > slides.length && (
            <div className="relative flex-shrink-0 w-20 h-12">
              <div className="w-full h-full bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-sm border-2 border-dashed border-blue-300 dark:border-blue-600 flex flex-col items-center justify-center">
                <div className="animate-pulse">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-1"></div>
                </div>
                <p className="text-xs text-muted-foreground text-center px-1">
                  +{deckStatus.totalSlides - slides.length} more
                </p>
              </div>
            </div>
          )}
          */}
        </div>
      </div>
      
      {/* Add Slide button at the end of thumbnails */}
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
