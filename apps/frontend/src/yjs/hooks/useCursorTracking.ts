/**
 * Hook for tracking cursor position on slides
 */
import { useEffect, useRef, useState } from 'react';
import { useYjs } from '../YjsProvider';
import { throttle } from 'lodash-es';

interface UseCursorTrackingOptions {
  /** ID of the current slide to track on */
  slideId: string;
  
  /** Ref to the container element */
  containerRef: React.RefObject<HTMLElement>;
  
  /** Whether cursor tracking is enabled */
  enabled?: boolean;
  
  /** Throttle delay in milliseconds */
  throttleMs?: number;
}

/**
 * Hook that tracks mouse cursor position and broadcasts it to other users
 */
export function useCursorTracking({
  slideId,
  containerRef,
  enabled = true,
  throttleMs = 30, // Balanced throttle time
}: UseCursorTrackingOptions) {
  const { updateCursor } = useYjs();
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  
  // Send immediate cursor position
  useEffect(() => {
    if (!enabled || !slideId || !containerRef.current) return;
    
    // Send position immediately
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const initialX = Math.round(rect.width / 2);
      const initialY = Math.round(rect.height / 2);
      updateCursor(slideId, initialX, initialY);
      setInitialized(true);
    }
  }, [slideId, enabled, containerRef, updateCursor]);
  
  useEffect(() => {
    if (!enabled || !slideId || !containerRef.current) return;
    
    // Throttled function to update cursor position with reduced threshold
    const handleMouseMove = throttle((e: MouseEvent) => {
      if (!containerRef.current) return;
      
      try {
        // Get position relative to container
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Only update if position has changed significantly (reduced threshold)
        if (
          Math.abs(x - lastPositionRef.current.x) > 2 ||
          Math.abs(y - lastPositionRef.current.y) > 2
        ) {
          lastPositionRef.current = { x, y };
          
          // Only broadcast if cursor is within the container
          if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            updateCursor(slideId, Math.round(x), Math.round(y));
          }
        }
      } catch (err) {
        console.error('Error tracking cursor:', err);
      }
    }, throttleMs);
    
    // Function to clear cursor when mouse leaves container
    const handleMouseLeave = () => {
      updateCursor('', 0, 0);
    };
    
    // Function to handle mouse enter (useful for re-establishing cursor after tab switching)
    const handleMouseEnter = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      try {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Force update on mouse enter to establish cursor quickly
        updateCursor(slideId, Math.round(x), Math.round(y));
      } catch (err) {
        console.error('Error on mouse enter:', err);
      }
    };
    
    // Add event listeners
    containerRef.current.addEventListener('mousemove', handleMouseMove);
    containerRef.current.addEventListener('mouseleave', handleMouseLeave);
    containerRef.current.addEventListener('mouseenter', handleMouseEnter);
    
    // Clean up
    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove);
        containerRef.current.removeEventListener('mouseleave', handleMouseLeave);
        containerRef.current.removeEventListener('mouseenter', handleMouseEnter);
      }
      handleMouseMove.cancel();
    };
  }, [slideId, enabled, containerRef, updateCursor, throttleMs]);
}

export default useCursorTracking;