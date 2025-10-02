import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@/context/NavigationContext';
import { useDeckStore } from '../stores/deckStore';
import { useEditor } from '@/hooks/useEditor';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { SlideData } from '@/types/SlideTypes';

export function useSlideNavigation() {
  const deckData = useDeckStore(state => state.deckData);
  const { currentSlideIndex, setCurrentSlideIndex } = useNavigation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const { isEditing } = useEditor();
  
  // Get slides from deckData
  const slides = deckData.slides;
  
  /**
   * Go to a specific slide by index with simplified animation
   * Checks for unsaved changes if in edit mode and not forced.
   * Returns an object indicating if confirmation is needed.
   */
  const goToSlide = useCallback((index: number, options?: { force?: boolean }): { confirmationNeeded: boolean, targetIndex?: number } => {
    const forceNavigation = options?.force || false;

    if (index < 0 || index >= slides.length) {
      console.warn(`goToSlide: Invalid index ${index}`);
      return { confirmationNeeded: false }; // Invalid index, no confirmation needed
    }

    const currentSlide = slides[currentSlideIndex];

    // Check for unsaved changes only if editing and not forcing navigation
    if (isEditing && !forceNavigation && currentSlide && currentSlide.id) {
      const editorStoreState = useEditorStore.getState();
      const historyStoreState = useHistoryStore.getState();

      const hasUnsavedChanges = editorStoreState.hasSlideChanged(currentSlide.id);
      const currentSlideHistoryIndex = historyStoreState.historyIndex?.[currentSlide.id] ?? -1;
      const hasAdvancedHistoryIndex = currentSlideHistoryIndex > 0;
      const hasRealChanges = hasUnsavedChanges && hasAdvancedHistoryIndex;
      
      if (hasRealChanges) {
        // Apply draft changes automatically before navigating
        editorStoreState.applyDraftChanges();
        // Proceed with navigation below, don't return here
      }
    }

    // Proceed with navigation if no unsaved changes, not editing, or forced
    setIsTransitioning(true);
    const newDirection = index > currentSlideIndex ? 'next' : 'prev';
    setDirection(newDirection);

    setCurrentSlideIndex(index);

    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);

    return { confirmationNeeded: false }; // Navigation occurred or will occur

  }, [currentSlideIndex, slides, setCurrentSlideIndex, isEditing]);
  
  /**
   * Navigate to the next slide with transition state
   */
  const goToNextSlide = useCallback(() => {
    if (currentSlideIndex < slides.length - 1) {
      // Directly navigate, goToSlide handles saving
      goToSlide(currentSlideIndex + 1);
    }
  }, [currentSlideIndex, slides.length, goToSlide]);

  /**
   * Navigate to the previous slide with transition state
   */
  const goToPrevSlide = useCallback(() => {
    if (currentSlideIndex > 0) {
       // Directly navigate, goToSlide handles saving
       goToSlide(currentSlideIndex - 1);
    }
  }, [currentSlideIndex, goToSlide]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip keyboard navigation when in text inputs or contentEditable elements
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      
      if (isInput || isContentEditable) return;
      
      if (e.key === 'ArrowRight') {
        goToNextSlide();
      } else if (e.key === 'ArrowLeft') {
        goToPrevSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goToNextSlide, goToPrevSlide]);

  return {
    goToNextSlide,
    goToPrevSlide,
    goToSlide,
    isTransitioning,
    direction,
    currentSlide: slides[currentSlideIndex],
    totalSlides: slides.length,
    currentSlideIndex,
  };
}
