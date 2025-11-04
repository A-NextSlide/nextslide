/**
 * React hook for detecting and handling text overflow in components
 */

import { useEffect, useRef, useCallback, RefObject } from 'react';
import { ComponentInstance } from '../types/components';
import {
  isOverflowing,
  detectAndFixOverflow,
  monitorAndFixOverflow,
  standardizeFontSize,
} from '../utils/fontOverflowDetection';

export interface UseOverflowDetectionOptions {
  /** Enable automatic font size adjustment when overflow is detected */
  autoAdjust?: boolean;
  /** Minimum allowed font size */
  minFontSize?: number;
  /** Maximum allowed font size */
  maxFontSize?: number;
  /** Debounce time in milliseconds */
  debounceMs?: number;
  /** Enable continuous monitoring via ResizeObserver and MutationObserver */
  enableMonitoring?: boolean;
  /** Callback when overflow is detected */
  onOverflowDetected?: (details: {
    hasOverflow: boolean;
    originalSize: number;
    suggestedSize: number | null;
  }) => void;
}

export interface UseOverflowDetectionReturn {
  /** Whether the element is currently overflowing */
  isOverflowing: boolean;
  /** The current overflow details */
  overflowDetails: {
    vertical: boolean;
    horizontal: boolean;
    scrollHeight: number;
    clientHeight: number;
    scrollWidth: number;
    clientWidth: number;
  } | null;
  /** Manually check for overflow */
  checkOverflow: () => void;
  /** Manually adjust font size to fix overflow */
  adjustFontSize: () => void;
  /** The suggested font size to fix overflow (null if no overflow) */
  suggestedFontSize: number | null;
}

/**
 * Hook to detect text overflow and optionally auto-adjust font size
 * 
 * @example
 * ```tsx
 * const MyComponent = ({ component, onUpdate }) => {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   
 *   const { isOverflowing, suggestedFontSize, checkOverflow } = useOverflowDetection(
 *     containerRef,
 *     component,
 *     {
 *       autoAdjust: true,
 *       enableMonitoring: true,
 *       onOverflowDetected: (details) => {
 *         if (details.suggestedSize) {
 *           onUpdate({ props: { fontSize: details.suggestedSize } });
 *         }
 *       }
 *     }
 *   );
 *   
 *   return <div ref={containerRef}>Content...</div>;
 * };
 * ```
 */
export function useOverflowDetection(
  elementRef: RefObject<HTMLElement>,
  component: ComponentInstance,
  options: UseOverflowDetectionOptions = {}
): UseOverflowDetectionReturn {
  const {
    autoAdjust = false,
    minFontSize = 8,
    maxFontSize = 72,
    debounceMs = 500,
    enableMonitoring = false,
    onOverflowDetected,
  } = options;

  const overflowStateRef = useRef<{
    isOverflowing: boolean;
    overflowDetails: ReturnType<typeof isOverflowing> | null;
    suggestedFontSize: number | null;
  }>({
    isOverflowing: false,
    overflowDetails: null,
    suggestedFontSize: null,
  });

  const checkOverflowTimeoutRef = useRef<number | null>(null);

  const checkOverflow = useCallback(() => {
    if (!elementRef.current) return;

    const details = isOverflowing(elementRef.current);
    overflowStateRef.current.isOverflowing = details.isOverflowing;
    overflowStateRef.current.overflowDetails = details;

    if (details.isOverflowing && autoAdjust) {
      const result = detectAndFixOverflow(elementRef.current, component, {
        minFontSize,
        maxFontSize,
      });

      if (result) {
        overflowStateRef.current.suggestedFontSize = result.suggestedSize;

        if (onOverflowDetected) {
          onOverflowDetected({
            hasOverflow: result.hasOverflow,
            originalSize: result.originalSize,
            suggestedSize: result.suggestedSize,
          });
        }
      }
    } else {
      overflowStateRef.current.suggestedFontSize = null;
    }
  }, [elementRef, component, autoAdjust, minFontSize, maxFontSize, onOverflowDetected]);

  const debouncedCheckOverflow = useCallback(() => {
    if (checkOverflowTimeoutRef.current) {
      clearTimeout(checkOverflowTimeoutRef.current);
    }
    checkOverflowTimeoutRef.current = window.setTimeout(checkOverflow, debounceMs);
  }, [checkOverflow, debounceMs]);

  const adjustFontSize = useCallback(() => {
    if (!elementRef.current) return;

    const result = detectAndFixOverflow(elementRef.current, component, {
      minFontSize,
      maxFontSize,
      autoFix: true,
    });

    if (result?.suggestedSize && onOverflowDetected) {
      onOverflowDetected({
        hasOverflow: result.hasOverflow,
        originalSize: result.originalSize,
        suggestedSize: result.suggestedSize,
      });
    }
  }, [elementRef, component, minFontSize, maxFontSize, onOverflowDetected]);

  // Set up monitoring if enabled
  useEffect(() => {
    if (!enableMonitoring || !elementRef.current) return;

    const cleanup = monitorAndFixOverflow(
      elementRef.current,
      component,
      (newFontSize) => {
        if (onOverflowDetected) {
          onOverflowDetected({
            hasOverflow: true,
            originalSize: component.props?.fontSize || 16,
            suggestedSize: newFontSize,
          });
        }
      },
      { minFontSize, maxFontSize, debounceMs }
    );

    return cleanup;
  }, [
    enableMonitoring,
    elementRef,
    component,
    minFontSize,
    maxFontSize,
    debounceMs,
    onOverflowDetected,
  ]);

  // Initial check
  useEffect(() => {
    if (elementRef.current) {
      debouncedCheckOverflow();
    }
  }, [elementRef, debouncedCheckOverflow]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (checkOverflowTimeoutRef.current) {
        clearTimeout(checkOverflowTimeoutRef.current);
      }
    };
  }, []);

  return {
    isOverflowing: overflowStateRef.current.isOverflowing,
    overflowDetails: overflowStateRef.current.overflowDetails,
    checkOverflow,
    adjustFontSize,
    suggestedFontSize: overflowStateRef.current.suggestedFontSize,
  };
}

/**
 * Simple hook to just standardize a font size value
 */
export function useStandardFontSize(
  fontSize: number,
  preferRoundDown: boolean = false
): number {
  return standardizeFontSize(fontSize, preferRoundDown);
}

