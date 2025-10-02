import { useRef, useEffect, useState } from 'react';

/**
 * A hook to measure the actual rendered bounds of any component
 * This works with any DOM element and captures overflow content
 */
export function useElementBounds() {
  const elementRef = useRef<HTMLElement | null>(null);
  const [bounds, setBounds] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const updateBounds = () => {
      if (!elementRef.current) return;
      
      // Get all the DOM nodes within the container (including text nodes)
      const allNodes = Array.from(elementRef.current.querySelectorAll('*'));
      
      // Add the container itself to the list of nodes to check
      allNodes.push(elementRef.current);
      
      // Initialize bounds with the first element
      let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
      
      // Check each node's bounds and find the collective bounding box
      allNodes.forEach(node => {
        const nodeRect = node.getBoundingClientRect();
        
        // Update min/max values to find the total bounding box
        minLeft = Math.min(minLeft, nodeRect.left);
        minTop = Math.min(minTop, nodeRect.top);
        maxRight = Math.max(maxRight, nodeRect.right);
        maxBottom = Math.max(maxBottom, nodeRect.bottom);
      });
      
      // Create the collective bounds
      setBounds({
        top: minTop,
        right: maxRight,
        bottom: maxBottom,
        left: minLeft,
        width: maxRight - minLeft,
        height: maxBottom - minTop,
        x: minLeft,
        y: minTop
      });
    };

    // Initial measurement
    updateBounds();
    
    // Update on resize
    window.addEventListener('resize', updateBounds);
    
    // Create a ResizeObserver to watch for content size changes
    // Use requestAnimationFrame to throttle updates and prevent excessive rendering
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        updateBounds();
      });
    });
    
    // Start observing the element
    resizeObserver.observe(elementRef.current);
    
    return () => {
      window.removeEventListener('resize', updateBounds);
      if (elementRef.current) {
        resizeObserver.unobserve(elementRef.current);
      }
      resizeObserver.disconnect();
    };
  }, []);

  return { ref: elementRef, bounds };
}

/**
 * A specialized version of useElementBounds for slide components
 * Converts screen coordinates to slide coordinates
 * Optimized for performance with throttling and reduced DOM queries
 */
export function useSlideElementBounds(slideSize: { width: number; height: number }) {
  // Use useRef for the bounds to avoid triggering re-renders from ResizeObserver
  const boundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  
  // Use useState for the public API
  const [slideBounds, setSlideBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  
  // Use a ref for the container
  const containerRef = useRef<HTMLElement | null>(null);
  
  // Throttling state
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 100; // Only update bounds at most every 100ms
  
  // Cache for slide dimensions and ratios
  const slideInfoRef = useRef<{
    element: Element | null;
    rect: DOMRect | null;
    actualWidth: number;
    actualHeight: number;
    ratioX: number;
    ratioY: number;
  }>({
    element: null,
    rect: null,
    actualWidth: slideSize.width,
    actualHeight: slideSize.height,
    ratioX: 1,
    ratioY: 1
  });

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Update the slide info cache
    const updateSlideInfo = () => {
      if (!containerRef.current) return false;
      
      // Find the slide container
      const slideElement = containerRef.current.closest('.slide-container');
      if (!slideElement) return false;
      
      // Only recalculate if the slide element changed
      if (slideElement !== slideInfoRef.current.element) {
        const slideRect = slideElement.getBoundingClientRect();
        
        // Get actual slide dimensions from data attributes
        let actualSlideWidth = slideSize.width;
        let actualSlideHeight = slideSize.height;
        try {
          const slideWidthAttr = slideElement.getAttribute('data-slide-width');
          const slideHeightAttr = slideElement.getAttribute('data-slide-height');
          if (slideWidthAttr) actualSlideWidth = parseInt(slideWidthAttr);
          if (slideHeightAttr) actualSlideHeight = parseInt(slideHeightAttr);
        } catch (err) {
          // Silently use defaults
        }
        
        // Calculate the ratio between display size and actual slide size
        slideInfoRef.current = {
          element: slideElement,
          rect: slideRect,
          actualWidth: actualSlideWidth,
          actualHeight: actualSlideHeight,
          ratioX: slideRect.width / actualSlideWidth,
          ratioY: slideRect.height / actualSlideHeight
        };
        
        return true;
      }
      
      return false;
    };

    const updateBounds = () => {
      if (!containerRef.current) return;
      
      // Apply throttling during dragging operations for better performance
      const now = Date.now();
      const isDragging = containerRef.current.closest('.component-container[style*="translate"]') !== null;
      
      if (isDragging && (now - lastUpdateRef.current) < THROTTLE_MS) {
        return; // Skip this update if we're dragging and updated recently
      }
      
      lastUpdateRef.current = now;
      
      // Update slide info if needed
      updateSlideInfo();
      
      // Use cached slide info
      const slideInfo = slideInfoRef.current;
      if (!slideInfo.rect) return;
      
      // Fast path for non-text elements or elements with few children
      const childCount = containerRef.current.childElementCount;
      const isTextContent = containerRef.current.tagName === 'DIV' && 
                           containerRef.current.textContent && 
                           containerRef.current.textContent.trim().length > 0;
      
      // Get the container's own bounds
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // For simple components, just use their own bounds without checking children
      if (!isTextContent && childCount <= 3) {
        // Calculate the bounding box in slide coordinates
        const newBounds = {
          x: Math.round((containerRect.left - slideInfo.rect.left) / slideInfo.ratioX),
          y: Math.round((containerRect.top - slideInfo.rect.top) / slideInfo.ratioY),
          width: Math.round(containerRect.width / slideInfo.ratioX),
          height: Math.round(containerRect.height / slideInfo.ratioY)
        };
        
        // Only update if significantly changed to reduce state updates
        if (!boundsRef.current || 
            Math.abs(boundsRef.current.x - newBounds.x) > 1 ||
            Math.abs(boundsRef.current.y - newBounds.y) > 1 ||
            Math.abs(boundsRef.current.width - newBounds.width) > 1 ||
            Math.abs(boundsRef.current.height - newBounds.height) > 1) {
          boundsRef.current = newBounds;
          setSlideBounds(newBounds);
        }
        
        return;
      }
      
      // For text components, use Range to capture text overflow
      if (isTextContent) {
        try {
          const range = document.createRange();
          range.selectNodeContents(containerRef.current);
          const contentBounds = range.getBoundingClientRect();
          
          // Calculate the bounding box in slide coordinates
          const newBounds = {
            x: Math.round((contentBounds.left - slideInfo.rect.left) / slideInfo.ratioX),
            y: Math.round((contentBounds.top - slideInfo.rect.top) / slideInfo.ratioY),
            width: Math.round(contentBounds.width / slideInfo.ratioX),
            height: Math.round(contentBounds.height / slideInfo.ratioY)
          };
          
          // Update if changed enough to matter
          if (!boundsRef.current || 
              Math.abs(boundsRef.current.x - newBounds.x) > 1 ||
              Math.abs(boundsRef.current.y - newBounds.y) > 1 ||
              Math.abs(boundsRef.current.width - newBounds.width) > 1 ||
              Math.abs(boundsRef.current.height - newBounds.height) > 1) {
            boundsRef.current = newBounds;
            setSlideBounds(newBounds);
          }
          
          return;
        } catch (err) {
          // Fall through to complex component method
        }
      }
      
      // Complex component method - use more selective node querying
      // Initialize with the container's bounds
      let minLeft = containerRect.left;
      let minTop = containerRect.top;
      let maxRight = containerRect.right;
      let maxBottom = containerRect.bottom;
      
      // For performance, limit the query to direct children and important elements
      // This avoids querying deep into complex components
      const directChildren = containerRef.current.children;
      
      // Process each direct child
      for (let i = 0; i < directChildren.length; i++) {
        const child = directChildren[i];
        const childRect = child.getBoundingClientRect();
        
        minLeft = Math.min(minLeft, childRect.left);
        minTop = Math.min(minTop, childRect.top);
        maxRight = Math.max(maxRight, childRect.right);
        maxBottom = Math.max(maxBottom, childRect.bottom);
        
        // Only process grandchildren for important elements that might affect bounds
        if (child.childElementCount > 0 && 
           (child.tagName === 'DIV' || child.tagName === 'SPAN' || 
            child.classList.contains('content') || child.classList.contains('wrapper'))) {
          
          // Query important grandchildren only
          const importantGrandchildren = child.querySelectorAll(':scope > div, :scope > span, :scope > p, :scope > h1, :scope > h2, :scope > h3');
          
          for (let j = 0; j < importantGrandchildren.length; j++) {
            const grandchild = importantGrandchildren[j];
            const grandchildRect = grandchild.getBoundingClientRect();
            
            minLeft = Math.min(minLeft, grandchildRect.left);
            minTop = Math.min(minTop, grandchildRect.top);
            maxRight = Math.max(maxRight, grandchildRect.right);
            maxBottom = Math.max(maxBottom, grandchildRect.bottom);
          }
        }
      }
      
      // Create a rect that encompasses nodes
      const collectiveRect = {
        left: minLeft,
        top: minTop,
        right: maxRight,
        bottom: maxBottom,
        width: maxRight - minLeft,
        height: maxBottom - minTop
      };
      
      // Calculate the bounding box in slide coordinates
      const newBounds = {
        x: Math.round((collectiveRect.left - slideInfo.rect.left) / slideInfo.ratioX),
        y: Math.round((collectiveRect.top - slideInfo.rect.top) / slideInfo.ratioY),
        width: Math.round(collectiveRect.width / slideInfo.ratioX),
        height: Math.round(collectiveRect.height / slideInfo.ratioY)
      };
      
      // Only update if bounds changed significantly
      if (!boundsRef.current || 
          Math.abs(boundsRef.current.x - newBounds.x) > 1 ||
          Math.abs(boundsRef.current.y - newBounds.y) > 1 ||
          Math.abs(boundsRef.current.width - newBounds.width) > 1 ||
          Math.abs(boundsRef.current.height - newBounds.height) > 1) {
        boundsRef.current = newBounds;
        setSlideBounds(newBounds);
      }
    };

    // Initial measurement
    updateBounds();
    
    // Add throttled resize handler
    let resizeTimeout: number | undefined;
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = window.setTimeout(() => {
        // Force recalculation of slide info on resize
        slideInfoRef.current.element = null;
        updateBounds();
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Create a throttled ResizeObserver to watch for content size changes
    let isUpdating = false;
    const resizeObserver = new ResizeObserver(() => {
      if (isUpdating) return;
      isUpdating = true;
      
      window.requestAnimationFrame(() => {
        updateBounds();
        isUpdating = false;
      });
    });
    
    // Start observing the element
    resizeObserver.observe(containerRef.current);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [slideSize]);

  return { ref: containerRef, slideBounds };
}