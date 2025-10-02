import { useEffect, useRef, useState, useCallback } from 'react';
import { ComponentInstance } from '../types/components';
import { 
  isTextOverflowing, 
  calculateOptimalFontSize, 
  applyTextFitting,
  monitorComponentOverflow 
} from '../utils/componentFittingUtils';

interface UseComponentBoundsFittingOptions {
  strategy?: 'shrink' | 'scroll' | 'truncate';
  minFontSize?: number;
  maxFontSize?: number;
  enabled?: boolean;
  debounceMs?: number;
}

export function useComponentBoundsFitting(
  component: ComponentInstance,
  containerRef: React.RefObject<HTMLElement>,
  options: UseComponentBoundsFittingOptions = {}
) {
  const {
    strategy = 'shrink',
    minFontSize = 8,
    maxFontSize = 72,
    enabled = true,
    debounceMs = 100
  } = options;

  const [isOverflowing, setIsOverflowing] = useState(false);
  const [adjustedFontSize, setAdjustedFontSize] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check and apply fitting
  const checkAndApplyFitting = useCallback(() => {
    if (!containerRef.current || !enabled) return;

    const element = containerRef.current;
    const overflowing = isTextOverflowing(element);
    setIsOverflowing(overflowing);

    if (overflowing && strategy === 'shrink') {
      const currentSize = parseInt(component.props.fontSize || '16');
      const optimal = calculateOptimalFontSize(
        element,
        minFontSize,
        Math.min(maxFontSize, currentSize),
        currentSize
      );
      
      if (optimal !== currentSize) {
        setAdjustedFontSize(optimal);
        element.style.fontSize = `${optimal}px`;
        
        // Also adjust line height proportionally
        const lineHeight = component.props.lineHeight || 1.5;
        const adjustedLineHeight = lineHeight * (optimal / currentSize);
        element.style.lineHeight = `${adjustedLineHeight}`;
      }
    } else if (!overflowing && adjustedFontSize !== null) {
      // Reset to original size if no longer overflowing
      element.style.fontSize = `${component.props.fontSize || 16}px`;
      element.style.lineHeight = `${component.props.lineHeight || 1.5}`;
      setAdjustedFontSize(null);
    }
  }, [component, containerRef, enabled, strategy, minFontSize, maxFontSize, adjustedFontSize]);

  // Debounced version of check
  const debouncedCheck = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      checkAndApplyFitting();
    }, debounceMs);
  }, [checkAndApplyFitting, debounceMs]);

  // Set up monitoring
  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    // Initial check
    checkAndApplyFitting();

    // Set up resize observer
    if ('ResizeObserver' in window) {
      observerRef.current = monitorComponentOverflow(
        containerRef.current,
        component,
        (overflowing) => {
          setIsOverflowing(overflowing);
          debouncedCheck();
        }
      );
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [component, containerRef, enabled, debouncedCheck, checkAndApplyFitting]);

  // Re-check when component props change
  useEffect(() => {
    debouncedCheck();
  }, [
    component.props.fontSize,
    component.props.text,
    component.props.texts,
    component.props.width,
    component.props.height,
    debouncedCheck
  ]);

  return {
    isOverflowing,
    adjustedFontSize,
    recheck: checkAndApplyFitting
  };
}

/**
 * Hook for image/video components to ensure proper fitting
 */
export function useMediaBoundsFitting(
  component: ComponentInstance,
  containerRef: React.RefObject<HTMLElement>,
  mediaRef: React.RefObject<HTMLImageElement | HTMLVideoElement>
) {
  const [fitMode, setFitMode] = useState<'contain' | 'cover' | 'fill'>(
    component.props.objectFit || 'contain'
  );

  useEffect(() => {
    if (!mediaRef.current) return;

    const media = mediaRef.current;
    
    // Apply object-fit CSS
    media.style.objectFit = fitMode;
    media.style.width = '100%';
    media.style.height = '100%';
    
    // Ensure media doesn't overflow container
    if (containerRef.current) {
      containerRef.current.style.overflow = 'hidden';
    }
  }, [fitMode, mediaRef, containerRef]);

  return {
    fitMode,
    setFitMode
  };
}