import { useState, useEffect, useRef } from 'react';
import { DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';
import { usePresentationStore } from '@/stores/presentationStore';

interface UseSlideScaleOptions {
  isThumbnail?: boolean;
  elementId?: string;
}

/**
 * Reusable hook for calculating slide scale based on container dimensions
 * Consolidates duplicated scaling logic from various renderer components
 */
export function useSlideScale(options: UseSlideScaleOptions = {}) {
  const { isThumbnail = false, elementId = 'slide-display-container' } = options;
  
  const NATIVE_WIDTH = DEFAULT_SLIDE_WIDTH;
  
  // Get initial slide width from DOM to prevent flash
  const getInitialSlideWidth = () => {
    if (isThumbnail) return NATIVE_WIDTH;
    const slideContainer = document.getElementById(elementId);
    if (slideContainer) {
      const rect = slideContainer.getBoundingClientRect();
      return rect.width || NATIVE_WIDTH;
    }
    return NATIVE_WIDTH;
  };

  const [currentSlideWidth, setCurrentSlideWidth] = useState(getInitialSlideWidth);
  const [containerScale, setContainerScale] = useState(currentSlideWidth / NATIVE_WIDTH);
  
  // Refs to track previous values
  const prevSlideWidthRef = useRef(currentSlideWidth);
  const updateScaleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check if we're in presentation mode
  const isPresenting = usePresentationStore(state => state.isPresenting);
  
  // Calculate scale factor
  const scaleFactor = isPresenting || isThumbnail ? 1 : containerScale;

  useEffect(() => {
    // Skip update logic for thumbnails
    if (isThumbnail) return;
    
    const updateScale = () => {
      // Clear any pending timeout
      if (updateScaleTimeoutRef.current) {
        clearTimeout(updateScaleTimeoutRef.current);
      }
      
      // Debounce the update
      updateScaleTimeoutRef.current = setTimeout(() => {
        const slideContainer = document.getElementById(elementId);
        if (slideContainer) {
          const slideRect = slideContainer.getBoundingClientRect();
          const slideDisplayWidth = slideRect.width;
          
          // Only update if the width actually changed
          if (Math.abs(slideDisplayWidth - prevSlideWidthRef.current) > 1) {
            prevSlideWidthRef.current = slideDisplayWidth;
            setCurrentSlideWidth(slideDisplayWidth);
            const newScale = slideDisplayWidth / NATIVE_WIDTH;
            setContainerScale(newScale);
          }
        }
      }, 50); // Debounce by 50ms
    };
    
    // Initial calculation
    updateScale();
    
    // Listen for resize events
    window.addEventListener('resize', updateScale);
    
    // Use ResizeObserver if available for more accurate tracking
    let resizeObserver: ResizeObserver | null = null;
    const slideContainer = document.getElementById(elementId);
    if (slideContainer && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateScale);
      resizeObserver.observe(slideContainer);
    }
    
    // Also update when edit mode changes (slide size changes)
    const editModeObserver = new MutationObserver(updateScale);
    if (slideContainer) {
      editModeObserver.observe(slideContainer, { 
        attributes: true, 
        attributeFilter: ['style', 'class'] 
      });
    }
    
    return () => {
      if (updateScaleTimeoutRef.current) {
        clearTimeout(updateScaleTimeoutRef.current);
      }
      window.removeEventListener('resize', updateScale);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      editModeObserver.disconnect();
    };
  }, [isThumbnail, elementId, isPresenting]);

  return {
    currentSlideWidth,
    containerScale,
    scaleFactor,
    nativeWidth: NATIVE_WIDTH
  };
} 