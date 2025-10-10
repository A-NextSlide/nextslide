/**
 * Utility functions for ensuring components fit within their bounds
 */

import { ComponentInstance } from '../types/components';

/**
 * Calculate if text content overflows its container
 */
export function isTextOverflowing(element: HTMLElement): boolean {
  if (!element) return false;
  
  // Get computed styles to extract padding information
  const computedStyle = window.getComputedStyle(element);
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
  
  // Total vertical and horizontal padding
  const verticalPadding = paddingTop + paddingBottom;
  const horizontalPadding = paddingLeft + paddingRight;
  
  // Base tolerance for rounding errors and font rendering variations
  const baseTolerance = 5;
  
  // Add padding-aware tolerance - account for the padding being applied
  // This prevents false positives when padding takes up significant space
  const verticalTolerance = baseTolerance + Math.min(verticalPadding * 0.1, 10);
  const horizontalTolerance = baseTolerance + Math.min(horizontalPadding * 0.1, 10);
  
  const isOverflowing = element.scrollHeight > (element.clientHeight + verticalTolerance) || 
                       element.scrollWidth > (element.clientWidth + horizontalTolerance);
  
  if (isOverflowing) {
    console.log('[isTextOverflowing] Detected overflow:', {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      verticalDifference: element.scrollHeight - element.clientHeight,
      horizontalDifference: element.scrollWidth - element.clientWidth,
      padding: {
        top: paddingTop,
        bottom: paddingBottom,
        left: paddingLeft,
        right: paddingRight,
        vertical: verticalPadding,
        horizontal: horizontalPadding
      },
      tolerance: {
        vertical: verticalTolerance,
        horizontal: horizontalTolerance
      },
      lineHeight: computedStyle.lineHeight
    });
  }
  
  return isOverflowing;
}

/**
 * Calculate optimal font size to fit text within bounds
 */
export function calculateOptimalFontSize(
  element: HTMLElement,
  minFontSize: number = 8,
  maxFontSize: number = 72,
  currentFontSize: number = 16
): number {
  if (!element) return currentFontSize;
  
  // Binary search for optimal font size
  let low = minFontSize;
  let high = Math.min(maxFontSize, currentFontSize);
  let optimal = currentFontSize;
  
  // Store original font size and padding info
  const originalFontSize = element.style.fontSize;
  const computedStyle = window.getComputedStyle(element);
  const paddingTotal = 
    (parseFloat(computedStyle.paddingTop) || 0) +
    (parseFloat(computedStyle.paddingBottom) || 0) +
    (parseFloat(computedStyle.paddingLeft) || 0) +
    (parseFloat(computedStyle.paddingRight) || 0);
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    element.style.fontSize = `${mid}px`;
    
    // Force layout recalculation
    element.offsetHeight;
    
    if (isTextOverflowing(element)) {
      high = mid - 1;
      optimal = mid - 1;
    } else {
      low = mid + 1;
      optimal = mid;
    }
  }
  
  // Restore original font size
  element.style.fontSize = originalFontSize;
  
  // Reduce optimal size by a smaller percentage when there's significant padding
  // This prevents over-aggressive shrinking when padding is already providing spacing
  // Use even more conservative factors to maintain readability
  let paddingFactor = 0.95; // Default 5% reduction
  if (paddingTotal > 30) {
    paddingFactor = 0.98; // Only 2% reduction with lots of padding
  } else if (paddingTotal > 20) {
    paddingFactor = 0.97; // 3% reduction with moderate padding
  }
  const safeOptimal = Math.floor(optimal * paddingFactor);
  
  console.log('[calculateOptimalFontSize] Result:', {
    currentFontSize,
    calculatedOptimal: optimal,
    safeOptimal,
    reduction: optimal - safeOptimal,
    paddingTotal,
    paddingFactor
  });
  
  return Math.max(minFontSize, safeOptimal);
}

/**
 * Apply text fitting strategies to a component
 */
export function applyTextFitting(
  element: HTMLElement,
  component: ComponentInstance,
  strategy: 'shrink' | 'scroll' | 'truncate' = 'shrink'
): void {
  if (!element || !component) return;
  
  switch (strategy) {
    case 'shrink':
      // Shrink font size to fit
      const currentSize = parseInt(component.props.fontSize || '16');
      const optimalSize = calculateOptimalFontSize(element, 8, currentSize, currentSize);
      if (optimalSize < currentSize) {
        element.style.fontSize = `${optimalSize}px`;
      }
      break;
      
    case 'scroll':
      // Enable scrolling for overflow content
      element.style.overflowY = 'auto';
      element.style.overflowX = 'hidden';
      break;
      
    case 'truncate':
      // Truncate with ellipsis
      element.style.overflow = 'hidden';
      element.style.textOverflow = 'ellipsis';
      element.style.whiteSpace = 'nowrap';
      break;
  }
}

/**
 * Calculate bounds for image to fit within container while maintaining aspect ratio
 */
export function calculateImageFit(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  fitMode: 'contain' | 'cover' | 'fill' = 'contain'
): { width: number; height: number; x: number; y: number } {
  if (fitMode === 'fill') {
    return { width: containerWidth, height: containerHeight, x: 0, y: 0 };
  }
  
  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;
  
  let width: number, height: number;
  
  if (fitMode === 'contain') {
    // Fit entire image within container
    if (imageRatio > containerRatio) {
      width = containerWidth;
      height = containerWidth / imageRatio;
    } else {
      height = containerHeight;
      width = containerHeight * imageRatio;
    }
  } else {
    // Cover entire container
    if (imageRatio > containerRatio) {
      height = containerHeight;
      width = containerHeight * imageRatio;
    } else {
      width = containerWidth;
      height = containerWidth / imageRatio;
    }
  }
  
  // Center the image
  const x = (containerWidth - width) / 2;
  const y = (containerHeight - height) / 2;
  
  return { width, height, x, y };
}

/**
 * Apply automatic bounds fitting to all components on a slide
 */
export function applyComponentBoundsFitting(components: ComponentInstance[]): void {
  components.forEach(component => {
    const element = document.querySelector(`[data-component-id="${component.id}"]`) as HTMLElement;
    if (!element) return;
    
    // Apply different strategies based on component type
    switch (component.type) {
      case 'TextBlock':
      case 'TiptapTextBlock':
        applyTextFitting(element, component, 'shrink');
        break;
        
      case 'Shape':
      case 'ShapeWithText':
        if (component.props.hasText) {
          const textElement = element.querySelector('.tiptap-editor') as HTMLElement;
          if (textElement) {
            applyTextFitting(textElement, component, 'shrink');
          }
        }
        break;
        
      case 'Table':
        element.style.overflow = 'auto';
        break;
        
      case 'Image':
      case 'Video':
        element.style.objectFit = 'contain';
        break;
    }
  });
}

/**
 * Monitor component for overflow and apply fitting automatically
 */
export function monitorComponentOverflow(
  element: HTMLElement,
  component: ComponentInstance,
  callback?: (isOverflowing: boolean) => void
): ResizeObserver | null {
  if (!element || !('ResizeObserver' in window)) return null;
  
  const observer = new ResizeObserver(() => {
    const overflowing = isTextOverflowing(element);
    
    if (callback) {
      callback(overflowing);
    }
    
    // Auto-apply fitting for text components
    if (overflowing && ['TextBlock', 'TiptapTextBlock'].includes(component.type)) {
      applyTextFitting(element, component, 'shrink');
    }
  });
  
  observer.observe(element);
  return observer;
}