/**
 * LazyLoadSlideContainer - Container component that handles lazy loading of slides
 * 
 * This component:
 * 1. Automatically manages which slides are loaded based on viewport visibility
 * 2. Integrates with the sharded document system for efficient loading
 * 3. Provides intersection observer-based visibility detection 
 */

import React, { useEffect, useRef } from 'react';
import { useShardedYjs } from './ShardedYjsProvider';

interface LazyLoadSlideContainerProps {
  /**
   * Array of all slide IDs in the presentation 
   */
  allSlideIds: string[];
  
  /**
   * Extra slides to load beyond those currently visible
   * (e.g. 1 would load the slide before and after the visible ones)
   */
  preloadBuffer?: number;
  
  /**
   * Threshold for intersection observer
   * (0.0 - 1.0, where 1.0 means fully visible)
   */
  visibilityThreshold?: number;
  
  /**
   * Callback when visible slides change
   */
  onVisibleSlidesChange?: (visibleSlideIds: string[]) => void;
  
  /**
   * Children components (slides to render)
   */
  children: React.ReactNode;
}

/**
 * Container for lazy loading slides based on visibility
 */
export const LazyLoadSlideContainer: React.FC<LazyLoadSlideContainerProps> = ({
  allSlideIds,
  preloadBuffer = 1,
  visibilityThreshold = 0.1,
  onVisibleSlidesChange,
  children
}) => {
  // Reference to the container element
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Reference to the intersection observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Reference to track which slides are visible
  const visibleSlideIdsRef = useRef<Set<string>>(new Set());
  
  // Get the setVisibleSlides function from context
  const { setVisibleSlides } = useShardedYjs();
  
  // Set up the intersection observer to track slide visibility
  useEffect(() => {
    // Create a map of element to slide ID for the observer
    const slideElements = new Map<Element, string>();
    
    // Function to update the visible slides
    const updateVisibleSlides = () => {
      const visibleSlideIds = Array.from(visibleSlideIdsRef.current);
      
      // Add buffer slides (preload adjacent slides)
      const bufferedSlideIds = [...visibleSlideIds];
      
      if (preloadBuffer > 0) {
        for (const slideId of visibleSlideIds) {
          const index = allSlideIds.indexOf(slideId);
          if (index !== -1) {
            // Add slides before
            for (let i = 1; i <= preloadBuffer; i++) {
              const prevIndex = index - i;
              if (prevIndex >= 0) {
                bufferedSlideIds.push(allSlideIds[prevIndex]);
              }
            }
            
            // Add slides after
            for (let i = 1; i <= preloadBuffer; i++) {
              const nextIndex = index + i;
              if (nextIndex < allSlideIds.length) {
                bufferedSlideIds.push(allSlideIds[nextIndex]);
              }
            }
          }
        }
      }
      
      // Remove duplicates
      const uniqueBufferedSlideIds = [...new Set(bufferedSlideIds)];
      
      // Update the document shard manager
      setVisibleSlides(uniqueBufferedSlideIds);
      
      // Call the change callback if provided
      if (onVisibleSlidesChange) {
        onVisibleSlidesChange(visibleSlideIds);
      }
    };
    
    // Callback for intersection observer
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      let changed = false;
      
      for (const entry of entries) {
        const slideId = slideElements.get(entry.target);
        if (!slideId) continue;
        
        if (entry.isIntersecting) {
          // Add to visible slides
          if (!visibleSlideIdsRef.current.has(slideId)) {
            visibleSlideIdsRef.current.add(slideId);
            changed = true;
          }
        } else {
          // Remove from visible slides
          if (visibleSlideIdsRef.current.has(slideId)) {
            visibleSlideIdsRef.current.delete(slideId);
            changed = true;
          }
        }
      }
      
      // Update if visibility changed
      if (changed) {
        updateVisibleSlides();
      }
    };
    
    // Create the intersection observer
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null, // Use viewport
      rootMargin: '100px', // Add margin to load slightly before visible
      threshold: visibilityThreshold
    });
    
    // Observe all slide elements
    if (containerRef.current) {
      // Find all slides (elements with data-slide-id attribute)
      const slides = containerRef.current.querySelectorAll('[data-slide-id]');
      
      slides.forEach(slide => {
        const slideId = slide.getAttribute('data-slide-id');
        if (slideId) {
          slideElements.set(slide, slideId);
          observerRef.current?.observe(slide);
        }
      });
    }
    
    // Clean up
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [allSlideIds, preloadBuffer, visibilityThreshold, setVisibleSlides, onVisibleSlidesChange]);
  
  return (
    <div ref={containerRef} className="lazy-load-slide-container">
      {children}
    </div>
  );
};