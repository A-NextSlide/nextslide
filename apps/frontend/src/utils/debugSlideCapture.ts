import { captureSlide } from '@/utils/slideCapture';
import { SlideData } from '@/types/SlideTypes';

export interface DebugCaptureOptions {
  showOverlay?: boolean;
  showLegend?: boolean;
  highlightOverflows?: boolean;
}

export interface DebugInfo {
  textOverflows: Array<{
    overflowCount: number;
    totalCount: number;
  }>;
  componentOverlaps: Array<{
    componentId: string;
    overlapsWithIds: string[];
  }>;
  totalComponents: number;
  issues: Array<{
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
  }>;
}

export interface DebugCaptureResult {
  slideId: string;
  html: string;
  screenshot: string;
  debugInfo: DebugInfo & {
    captureOptions: DebugCaptureOptions;
    timestamp: string;
  };
}

/**
 * Captures a slide with debug overlays visible for AI model analysis
 */
export async function captureSlideWithDebugInfo(
  slideElement: HTMLElement,
  slideId: string,
  slideIndex: number,
  totalSlides: number,
  options: DebugCaptureOptions = {}
): Promise<DebugCaptureResult | null> {
  const {
    showOverlay = true,
    showLegend = false,
    highlightOverflows = true
  } = options;

  console.log('[captureSlideWithDebugInfo] Starting debug capture', { slideId, showOverlay, showLegend });

  // Inject CSS to ensure bounding boxes are visible
  const styleId = 'debug-overlay-styles';
  let styleElement = document.getElementById(styleId) as HTMLStyleElement;
  
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = `
      .bounding-box-overlay {
        box-sizing: border-box !important;
      }
      
      /* Ensure borders are visible in screenshots */
      .bounding-box-overlay[style*="dashed"] {
        border: 3px dashed rgba(59, 130, 246, 1) !important;
        background-color: rgba(59, 130, 246, 0.1) !important;
      }
      
      .bounding-box-overlay[style*="solid"] {
        border: 3px solid !important;
        background-color: rgba(239, 68, 68, 0.15) !important;
      }
      
      /* Make overflow indicators more prominent */
      .overflow-indicator {
        font-weight: bold !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      }
    `;
    document.head.appendChild(styleElement);
  }

  // Temporarily add debug overlay attributes to the slide container
  const originalDebugOverlay = slideElement.getAttribute('data-show-debug-overlay');
  const originalDebugLegend = slideElement.getAttribute('data-show-debug-legend');
  
  try {
    // Set debug attributes
    slideElement.setAttribute('data-show-debug-overlay', showOverlay.toString());
    slideElement.setAttribute('data-show-debug-legend', showLegend.toString());
    
    // Force a re-render by dispatching a custom event
    const debugEvent = new CustomEvent('slide:debug-capture', {
      detail: { 
        slideId, 
        showOverlay, 
        showLegend,
        highlightOverflows 
      },
      bubbles: true
    });
    window.dispatchEvent(debugEvent);
    slideElement.dispatchEvent(debugEvent);
    
    // Force the overlay to be visible by directly updating the component
    // This is more reliable than simulating keyboard events
    const overlayElements = document.querySelectorAll('[data-force-visible]');
    overlayElements.forEach(el => {
      el.setAttribute('data-force-visible', 'true');
    });
    
    // Also dispatch a custom event that the overlay can listen to
    const showOverlayEvent = new CustomEvent('debug:show-overlay', {
      detail: { show: showOverlay },
      bubbles: true
    });
    window.dispatchEvent(showOverlayEvent);
    
    // Wait longer for the overlay to render
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if overlay is actually rendered
    const overlayElement = slideElement.querySelector('[style*="isolation"]');
    console.log('[captureSlideWithDebugInfo] Overlay found:', !!overlayElement);
    
    // Check for bounding box elements
    const boundingBoxes = slideElement.querySelectorAll('.bounding-box-overlay');
    console.log(`[captureSlideWithDebugInfo] Found ${boundingBoxes.length} bounding box elements`);
    
    if (boundingBoxes.length > 0) {
      boundingBoxes.forEach((box, idx) => {
        const rect = (box as HTMLElement).getBoundingClientRect();
        const style = (box as HTMLElement).style;
        console.log(`[captureSlideWithDebugInfo] Box ${idx}:`, {
          border: style.border,
          position: `${style.left}, ${style.top}`,
          size: `${style.width} x ${style.height}`,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      });
    }
    
    // Force all elements to be visible for screenshot
    const allElements = slideElement.querySelectorAll('*');
    allElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style.opacity === '0') {
        htmlEl.style.opacity = '1';
      }
    });
    
    // Use custom capture with enhanced settings for debug overlay
    let captureResult = null;
    try {
      // Use html2canvas directly with special settings
      const canvas = await import('html2canvas').then(module => module.default(slideElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF',
        logging: true,
        onclone: (documentClone) => {
          // Ensure overlay is visible in clone
          const clonedSlide = documentClone.querySelector(`[data-slide-id="${slideId}"]`) as HTMLElement;
          if (clonedSlide) {
            // Re-add bounding box styles to the cloned document
            const styleEl = documentClone.createElement('style');
            styleEl.textContent = `
              .bounding-box-overlay {
                opacity: 1 !important;
                visibility: visible !important;
              }
              .overflow-indicator {
                opacity: 1 !important;
                visibility: visible !important;
              }
            `;
            documentClone.head.appendChild(styleEl);
            
            // Find and ensure all overlay elements are visible
            const overlayDivs = clonedSlide.querySelectorAll('.bounding-box-overlay, .overflow-indicator');
            console.log(`[captureSlideWithDebugInfo] Found ${overlayDivs.length} overlay elements in clone`);
            
            overlayDivs.forEach(div => {
              const el = div as HTMLElement;
              el.style.opacity = '1';
              el.style.visibility = 'visible';
            });
          }
        }
      }));
      
      captureResult = {
        slideId,
        html: slideElement.outerHTML,
        screenshot: canvas.toDataURL('image/png')
      };
    } catch (error) {
      console.error('[captureSlideWithDebugInfo] Custom capture failed:', error);
      // Fallback to regular capture
      captureResult = await captureSlide(
        slideElement,
        slideId,
        slideIndex,
        totalSlides
      );
    }
    
    // Enhance the result with debug metadata
    if (captureResult) {
      // Extract debug information from the rendered overlays
      const debugInfo = extractDebugInfo(slideElement);
      
      console.log('[captureSlideWithDebugInfo] Debug info extracted:', debugInfo);
      
      return {
        slideId: captureResult.slideId,
        html: captureResult.html,
        screenshot: captureResult.screenshot,
        debugInfo: {
          ...debugInfo,
          captureOptions: options,
          timestamp: new Date().toISOString()
        }
      };
    }
    
    return null;
  } finally {
    // Restore original attributes
    if (originalDebugOverlay !== null) {
      slideElement.setAttribute('data-show-debug-overlay', originalDebugOverlay);
    } else {
      slideElement.removeAttribute('data-show-debug-overlay');
    }
    
    if (originalDebugLegend !== null) {
      slideElement.setAttribute('data-show-debug-legend', originalDebugLegend);
    } else {
      slideElement.removeAttribute('data-show-debug-legend');
    }
    
    // Hide overlay if it was shown
    if (showOverlay) {
      const hideOverlayEvent = new CustomEvent('debug:show-overlay', {
        detail: { show: false },
        bubbles: true
      });
      window.dispatchEvent(hideOverlayEvent);
    }
    
    // Dispatch event to hide debug overlay
    const hideEvent = new CustomEvent('slide:debug-capture-complete', {
      detail: { slideId },
      bubbles: true
    });
    window.dispatchEvent(hideEvent);
    slideElement.dispatchEvent(hideEvent);
  }
}

/**
 * Extracts debug information from the rendered slide
 */
function extractDebugInfo(slideElement: HTMLElement): DebugInfo {
  const debugInfo: DebugInfo = {
    textOverflows: [],
    componentOverlaps: [],
    totalComponents: 0,
    issues: []
  };
  
  // Find all overflow indicators
  const overflowElements = slideElement.querySelectorAll('[data-overflow-info]');
  overflowElements.forEach(el => {
    const info = el.getAttribute('data-overflow-info');
    if (info) {
      try {
        debugInfo.textOverflows.push(JSON.parse(info));
      } catch (e) {
        // Fallback to text content parsing
        const text = el.textContent || '';
        const match = text.match(/(\d+) of (\d+) characters overflow/);
        if (match) {
          debugInfo.textOverflows.push({
            overflowCount: parseInt(match[1]),
            totalCount: parseInt(match[2])
          });
        }
      }
    }
  });
  
  // Count total components
  debugInfo.totalComponents = slideElement.querySelectorAll('[data-component-id]').length;
  
  // Build issues summary
  if (debugInfo.textOverflows.length > 0) {
    const totalOverflow = debugInfo.textOverflows.reduce(
      (sum: number, item) => sum + (item.overflowCount || 0), 
      0
    );
    debugInfo.issues.push({
      type: 'text-overflow',
      severity: 'high',
      message: `${debugInfo.textOverflows.length} text components have overflow (${totalOverflow} total characters)`
    });
  }
  
  if (debugInfo.componentOverlaps.length > 0) {
    debugInfo.issues.push({
      type: 'component-overlap',
      severity: 'medium',
      message: `${debugInfo.componentOverlaps.length} components are overlapping`
    });
  }
  
  return debugInfo;
}

export interface SlideLayoutReport {
  slideId: string;
  timestamp: string;
  issues: Array<{
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
  }>;
  summary: {
    hasTextOverflow: boolean;
    hasComponentOverlap: boolean;
    totalIssues: number;
    componentCount: number;
  };
  recommendations: string[];
  screenshot: string;
}

/**
 * Analyzes a slide and returns a structured report of layout issues
 */
export async function analyzeSlideLayout(
  slideElement: HTMLElement,
  slideData: SlideData
): Promise<SlideLayoutReport | null> {
  // Capture with debug overlay
  const debugCapture = await captureSlideWithDebugInfo(
    slideElement,
    slideData.id,
    0,
    1,
    { showOverlay: true, showLegend: false }
  );
  
  if (!debugCapture || !debugCapture.debugInfo) {
    return null;
  }
  
  const report: SlideLayoutReport = {
    slideId: slideData.id,
    timestamp: new Date().toISOString(),
    issues: debugCapture.debugInfo.issues || [],
    summary: {
      hasTextOverflow: debugCapture.debugInfo.textOverflows.length > 0,
      hasComponentOverlap: debugCapture.debugInfo.componentOverlaps.length > 0,
      totalIssues: debugCapture.debugInfo.issues.length,
      componentCount: debugCapture.debugInfo.totalComponents
    },
    recommendations: generateRecommendations(debugCapture.debugInfo),
    screenshot: debugCapture.screenshot
  };
  
  return report;
}

/**
 * Generates recommendations based on debug info
 */
function generateRecommendations(debugInfo: DebugInfo): string[] {
  const recommendations: string[] = [];
  
  if (debugInfo.textOverflows.length > 0) {
    recommendations.push('Reduce text content or increase container size for overflowing text components');
    
    debugInfo.textOverflows.forEach((overflow) => {
      if (overflow.overflowCount > 50) {
        recommendations.push(`Consider splitting long text content into multiple components`);
      }
    });
  }
  
  if (debugInfo.componentOverlaps.length > 0) {
    recommendations.push('Reposition overlapping components to improve visual clarity');
  }
  
  return recommendations;
}