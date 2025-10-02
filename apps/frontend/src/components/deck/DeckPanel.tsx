import React, { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useSlideNavigation } from '@/hooks/useSlideNavigation';
import { useDeckStore } from '@/stores/deckStore';
import { useEditor } from '@/hooks/useEditor';
import { useToast } from '@/hooks/use-toast';

import SlideViewport from './SlideViewport';
import ThumbnailNavigator from './ThumbnailNavigator';

/**
 * DeckPanel component that displays the slide deck
 */
const DeckPanel: React.FC = () => {
  const { 
    goToNextSlide, 
    goToPrevSlide, 
    goToSlide,
    isTransitioning,
    direction,
    currentSlide,
    totalSlides,
    currentSlideIndex
  } = useSlideNavigation();
  
  const deckData = useDeckStore(state => state.deckData);
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const updateSlide = useDeckStore(state => state.updateSlide);
  
  const { isEditing } = useEditor();
  
  const { toast } = useToast();
  
  const panelRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number>(600);

  const handleThumbnailClick = useCallback((index: number) => {
    // ... existing code ...
  }, [goToSlide, deckData.slides, toast]);
  
  const handleSlideDelete = (slideId: string) => {
    // Parent component can handle additional logic if needed
    // The actual deletion is handled by ThumbnailNavigator
  };
  
  // Add event listener for programmatic navigation
  useLayoutEffect(() => {
    const handleNavigateToIndex = (event: CustomEvent) => {
      const { index } = event.detail;
      console.log('[DeckPanel] Received slide:navigate:index event with index:', index);
      if (typeof index === 'number' && index >= 0 && index < deckData.slides.length) {
        console.log('[DeckPanel] Navigating to slide index:', index);
        goToSlide(index);
      }
    };
    
    window.addEventListener('slide:navigate:index', handleNavigateToIndex as EventListener);
    
    return () => {
      window.removeEventListener('slide:navigate:index', handleNavigateToIndex as EventListener);
    };
  }, [goToSlide, deckData.slides.length]);
  
  useLayoutEffect(() => {
    const calculateHeight = () => {
      if (panelRef.current && thumbsRef.current) {
        const panelRect = panelRef.current.getBoundingClientRect();
        const thumbsRect = thumbsRef.current.getBoundingClientRect();
        const availableHeight = panelRect.height - thumbsRect.height;
        const buffer = 16; 
        setViewportMaxHeight(Math.max(100, availableHeight - buffer));
      } else {
        setViewportMaxHeight(600);
      }
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  return (
    <div ref={panelRef} className="flex flex-col h-full w-full overflow-hidden bg-transparent">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 h-0 overflow-hidden flex flex-col relative">
          {viewportMaxHeight && (
            <SlideViewport 
              slides={deckData.slides}
              currentSlideIndex={currentSlideIndex}
              totalSlides={totalSlides}
              direction={direction}
              isTransitioning={isTransitioning}
              isEditing={isEditing}
              goToPrevSlide={goToPrevSlide}
              goToNextSlide={goToNextSlide}
              updateSlide={updateSlide}
              viewportMaxHeight={viewportMaxHeight}
            />
          )}
        </div>
        
        <div ref={thumbsRef} className="p-2 pt-0">
          <ThumbnailNavigator 
            slides={deckData.slides}
            currentSlideIndex={currentSlideIndex}
            onThumbnailClick={handleThumbnailClick}
            isTransitioning={isTransitioning}
            onSlideDelete={handleSlideDelete}
          />
        </div>
      </div>
    </div>
  );
};

export default DeckPanel;
