import React, { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { useSlideNavigation } from '@/hooks/useSlideNavigation';
import { useDeckStore } from '../stores/deckStore';
import { useEditor } from '@/hooks/useEditor';
import { useEditorStore } from '../stores/editorStore';
import { useToast } from '@/hooks/use-toast';
import { useHistoryStore } from '../stores/historyStore';
import { useNavigation } from '@/context/NavigationContext';
import { createComponent } from '@/utils/componentUtils';
import { SlideData } from '@/types/SlideTypes';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// Import our component modules
import SlideViewport from './deck/SlideViewport';
import ThumbnailNavigator from './deck/ThumbnailNavigator';
import { DeckStatus } from '@/types/DeckTypes';

interface DeckPanelProps {
  deckStatus?: DeckStatus;
  isNewDeck?: boolean;
  slides?: SlideData[];
  currentSlideIndex?: number;
}

/**
 * DeckPanel component that displays the slide deck
 */
const DeckPanel: React.FC<DeckPanelProps> = ({ deckStatus, isNewDeck }) => {
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
  
  // Use Zustand store directly
  const deckData = useDeckStore(state => state.deckData);
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const updateSlide = useDeckStore(state => state.updateSlide);
  const addSlide = useDeckStore(state => state.addSlide);
  
  // Use the unified editor hook
  const { isEditing, setIsEditing, undo, redo, canUndo, canRedo } = useEditor();
  
  // Toast notifications
  const { toast } = useToast();
  
  // Enable keyboard shortcuts
  useKeyboardShortcuts();
  
  // Handle undo button click
  const handleUndo = () => {
    if (undo && canUndo && canUndo()) {
      undo();
      
      // Toast notification will be added in the useEditor hook
    }
  };
  
  // Handle redo button click
  const handleRedo = () => {
    if (redo && canRedo && canRedo()) {
      redo();
      
      // Toast notification will be added in the useEditor hook
    }
  };
  
  
  // Initialize deckName from deckData or use default if not set
  const [deckName, setDeckName] = useState(deckData.name || 'New Presentation');
  
  // Add event listener for programmatic navigation
  useEffect(() => {
    const handleNavigateToIndex = (event: CustomEvent) => {
      const { index } = event.detail;
      if (typeof index === 'number' && index >= 0 && index < deckData.slides.length) {
        goToSlide(index);
      }
    };
    
    window.addEventListener('slide:navigate:index', handleNavigateToIndex as EventListener);
    
    return () => {
      window.removeEventListener('slide:navigate:index', handleNavigateToIndex as EventListener);
    };
  }, [goToSlide, deckData.slides.length]);
  
  // Create display slides that include placeholders when generating
  const displaySlides = React.useMemo(() => {
    // During generation, we need to show slides immediately
    if (deckStatus?.state === 'generating' || deckStatus?.state === 'creating') {
      // Determine how many thumbnails to show
      const knownTotal = deckStatus?.totalSlides && deckStatus.totalSlides > 0
        ? deckStatus.totalSlides
        : 0;
      const currentSlides = deckData.slides || [];
      // Prefer backend total; else outline count; else current slide count (no arbitrary minimum)
      const outlineCount = Array.isArray((deckData as any)?.outline?.slides)
        ? (deckData as any).outline.slides.length
        : 0;
      const expectedTotal = knownTotal > 0
        ? knownTotal
        : (outlineCount > 0 ? outlineCount : currentSlides.length);

      // Merge existing slides with placeholders up to expectedTotal
      const slidesWithPlaceholders = Array.from({ length: expectedTotal }, (_, index) => {
        const existing = currentSlides[index];
        if (existing) return existing;
        return {
          id: `${deckData.uuid || 'temp'}-slide-${index}`,
          title: `Slide ${index + 1}`,
          components: [],
          order: index,
          deckId: deckData.uuid,
          status: 'pending' as const,
          isGenerating: true
        };
      });

      return slidesWithPlaceholders;
    }

    // For non-generating states - return slides as-is
    return deckData.slides;
  }, [deckData.slides, deckData.uuid, deckStatus, isNewDeck]);
  
  // Refs for height calculation
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  
  // State for calculated max viewport height
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number>(600); // Set initial state to 600

  React.useEffect(() => {
    if (deckData.name && deckData.name !== deckName) {
      setDeckName(deckData.name);
    }
  }, [deckData.name]);

  const handleAddNewSlide = useCallback(async () => {
    try {
      // Allow slide creation utility to apply the default template/components
      await addSlide({
        deckId: deckData.id,
        order: displaySlides.length,
        status: 'completed' as const
      });

      // After adding, navigate to the new slide (which is now the last one), forcing navigation
      goToSlide(displaySlides.length - 1, { force: true });
    } catch (error) {
      console.error('Error adding new slide:', error);
      toast({
        title: 'Error',
        description: 'Failed to add new slide',
        variant: 'destructive'
      });
    }
  }, [addSlide, goToSlide, displaySlides.length, toast]);

  const handleThumbnailClick = useCallback((index: number) => {
    // Ensure the index is valid
    if (index < 0 || index >= displaySlides.length) {
      toast({
        title: "Navigation Error",
        description: `Invalid slide index: ${index}`,
        variant: "destructive"
      });
      return;
    }

    // Check if it's a valid slide to navigate to
    const targetSlide = displaySlides[index];
    if (!targetSlide || !targetSlide.id) {
      toast({
        title: "Navigation Error",
        description: "Could not find target slide",
        variant: "destructive"
      });
      return;
    }

    // No longer need to check for unsaved changes here, as useSlideNavigation handles it.
    // Simply call goToSlide.
    goToSlide(index);
  }, [goToSlide, displaySlides, toast]);
  
  const handleSlideDelete = (slideId: string) => {
    
    // Don't allow deleting placeholder slides
    if (slideId.startsWith('placeholder-')) {
      console.warn(`DeckPanel: Cannot delete placeholder slide ${slideId}`);
      return;
    }
    
    // Find the index of the slide being deleted
    const slideIndex = displaySlides.findIndex(slide => slide.id === slideId);
    
    if (slideIndex === -1) {
      console.warn(`DeckPanel: Could not find slide ${slideId} for deletion`);
      return;
    }
    
    // If the deleted slide is the current slide or comes before it,
    // we need to adjust the current slide index
    if (slideIndex <= currentSlideIndex) {
      const newIndex = Math.max(0, currentSlideIndex - 1);
      
      // Use setTimeout to ensure the slide is removed from the array first
      // Force navigation as the context (deletion) implies user wants to move
      setTimeout(() => {
        goToSlide(newIndex, { force: true });
      }, 50);
    }
  };
  
  const handleDeckNameChange = (newName: string) => {
    setDeckName(newName);
    updateDeckData({ name: newName });
  };

  return (
    <div ref={panelRef} className="glass-panel flex flex-col h-full rounded-lg overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Slide viewport section - use all available space */}
        <div className="flex-1 h-0 overflow-hidden flex flex-col relative">
          {viewportMaxHeight && (
            <SlideViewport 
              slides={displaySlides}
              currentSlideIndex={currentSlideIndex}
              totalSlides={totalSlides}
              direction={direction}
              isTransitioning={isTransitioning}
              isEditing={isEditing}
              goToPrevSlide={goToPrevSlide}
              goToNextSlide={goToNextSlide}
              updateSlide={updateSlide}
              viewportMaxHeight={viewportMaxHeight}
              deckStatus={deckStatus}
              isNewDeck={isNewDeck}
            />
          )}
        </div>
        
        {/* Thumbnail navigation section - Add ref */}
        <div ref={thumbsRef} className="p-2 pt-0">
          <ThumbnailNavigator 
            slides={displaySlides}
            currentSlideIndex={currentSlideIndex}
            onThumbnailClick={handleThumbnailClick}
            isTransitioning={isTransitioning}
            onSlideDelete={handleSlideDelete}
            deckStatus={deckStatus}
            isNewDeck={isNewDeck}
          />
        </div>
      </div>
    </div>
  );
};

export default DeckPanel;
