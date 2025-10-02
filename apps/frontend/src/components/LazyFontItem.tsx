import React, { useEffect, useState, useRef } from 'react';
import { FontLoadingService } from '../services/FontLoadingService';

interface LazyFontItemProps {
  fontName: string;
  isActive?: boolean;
  onClick: () => void;
  className?: string;
  category?: string;
}

/**
 * Optimized font item that intelligently loads fonts in dropdown lists
 * Uses the Intersection Observer API to only load fonts when visible
 * Avoids loading during drag operations and prioritizes active/visible fonts
 */
const LazyFontItem: React.FC<LazyFontItemProps> = ({
  fontName,
  isActive = false,
  onClick,
  className = '',
  category = 'Standard'
}) => {
  // Track if this specific font has been loaded
  const [isLoaded, setIsLoaded] = useState(FontLoadingService.isFontLoaded(fontName));
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Determine priority based on category and active state
  const getPriority = () => {
    if (isActive) return 1; // Active font should load immediately
    if (category === 'System & Web Safe') return 1;
    if (category === 'Sans-Serif' || category === 'Serif') return 2;
    if (isVisible) return 3; // Visible but not selected font
    return 4; // Not visible, lowest priority
  };
  
  // Set up intersection observer to detect when this font item is visible
  useEffect(() => {
    if (!elementRef.current) return;
    
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    observerRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      setIsVisible(entry.isIntersecting);
    }, {
      root: null, // viewport
      rootMargin: '100px', // load slightly before it becomes visible
      threshold: 0.1 // 10% visible is enough to trigger loading
    });
    
    observerRef.current.observe(elementRef.current);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
  // Only load the font when element is visible or active
  useEffect(() => {
    // Skip if already loaded
    if (isLoaded) return;
    
    // Skip load during drag operations
    const isDragging = !!document.querySelector('.component-container[style*="translate"]');
    if (isDragging) return;
    
    // Get priority based on visibility and other factors
    const priority = getPriority();
    
    // If it's active or visible, load it
    if (isActive || isVisible) {
      // Flag to handle component unmounting
      let mounted = true;
      
      // Use requestIdleCallback for low-priority font loading to avoid interfering with UI
      if (window.requestIdleCallback && priority > 2) {
        window.requestIdleCallback(() => {
          // Load the font with appropriate priority
          FontLoadingService.loadFont(fontName, priority).then(() => {
            if (mounted) {
              setIsLoaded(true);
            }
          });
        });
      } else {
        // For high priority (active fonts), load immediately
        FontLoadingService.loadFont(fontName, priority).then(() => {
          if (mounted) {
            setIsLoaded(true);
          }
        });
      }
      
      // Cleanup
      return () => { mounted = false; };
    }
  }, [fontName, isLoaded, isActive, isVisible]);
  
  // Use system font stack as fallback to maintain consistent layout
  const fallbackFontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  
  return (
    <div 
      ref={elementRef}
      className={`${isActive ? 'bg-muted' : ''} h-8 py-1 px-2 cursor-pointer ${className}`}
      onClick={onClick}
      data-font-name={fontName}
      data-font-loaded={isLoaded}
    >
      <span 
        className="w-full truncate"
        // Use font if loaded, otherwise fall back to system font
        style={{ 
          fontFamily: isLoaded ? `"${fontName}", ${fallbackFontFamily}` : fallbackFontFamily,
          // Use consistent font weight to prevent layout shifts
          fontWeight: 400
        }}
      >
        {fontName}
      </span>
    </div>
  );
};

export default LazyFontItem;
