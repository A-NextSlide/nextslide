import React, { useEffect, useState, useRef } from 'react';
import { ComponentInstance } from '@/types/components';
import { getComponentBounds, measureTextBounds } from '@/utils/overlapDetection';
import { useActiveSlide } from '@/context/ActiveSlideContext';

interface BoundingBoxInfo {
  componentId: string;
  componentType: string;
  contentBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  containerBounds: {
    x: number;
    y: number; 
    width: number;
    height: number;
  };
  hasOverflow: boolean;
  overflowType?: 'container' | 'overlap' | 'both';
  overlapsWithIds?: string[];
  textElementBounds?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
  }>;
  overflowCharacterCount?: number;
  totalCharacterCount?: number;
  visibleCharacterCount?: number;
  isTextComponent?: boolean;
}

interface TextBoundingBoxOverlayProps {
  forceVisible?: boolean; // Allow forcing visibility for model rendering
  showLegend?: boolean; // Control legend visibility
  components?: ComponentInstance[]; // Allow passing components directly
}

const TextBoundingBoxOverlay: React.FC<TextBoundingBoxOverlayProps> = ({ 
  forceVisible = false,
  showLegend = false,
  components: propComponents
}) => {
  const [isVisible, setIsVisible] = useState(forceVisible);
  const [showDetails, setShowDetails] = useState(false);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBoxInfo[]>([]);
  const measurementTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update visibility when forceVisible changes
  useEffect(() => {
    if (forceVisible) {
      setIsVisible(true);
    }
  }, [forceVisible]);
  
  // Try to get components from context, but allow fallback to props
  let activeComponents: ComponentInstance[] = [];
  let slideId: string | null = null;
  
  // Prefer prop components if provided
  if (propComponents && propComponents.length > 0) {
    activeComponents = propComponents;
  } else {
    // Try to get from context
    try {
      const context = useActiveSlide();
      activeComponents = context.activeComponents;
      slideId = context.slideId;
    } catch (e) {
      // Context not available
      activeComponents = [];
    }
  }
  
  // If we still don't have components, try to get them from the slide element
  useEffect(() => {
    if (isVisible && activeComponents.length === 0 && !propComponents) {
      // Try to extract components from the rendered slide
      const slideContainer = document.querySelector('.slide-container');
      if (slideContainer) {
        const componentElements = slideContainer.querySelectorAll('[data-component-id]');
        
        // Extract basic component info from DOM
        const extractedComponents: ComponentInstance[] = [];
        componentElements.forEach(el => {
          const id = el.getAttribute('data-component-id');
          const type = el.getAttribute('data-component-type') || 'Unknown';
          if (id) {
            // Try to get bounds from the element's style or position
            const rect = el.getBoundingClientRect();
            const slideRect = slideContainer.getBoundingClientRect();
            const slideWidth = parseInt(slideContainer.getAttribute('data-slide-width') || '1920');
            const slideHeight = parseInt(slideContainer.getAttribute('data-slide-height') || '1080');
            
            const scaleX = slideWidth / slideRect.width;
            const scaleY = slideHeight / slideRect.height;
            
            extractedComponents.push({
              id,
              type,
              props: {
                x: (rect.left - slideRect.left) * scaleX,
                y: (rect.top - slideRect.top) * scaleY,
                width: rect.width * scaleX,
                height: rect.height * scaleY
              }
            } as ComponentInstance);
          }
        });
        
        if (extractedComponents.length > 0) {
          activeComponents = extractedComponents;
        }
      }
    }
  }, [isVisible, activeComponents.length, propComponents]);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    if (forceVisible) {
      setIsVisible(true);
      return;
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+D (or Cmd+D on Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Ctrl+D toggles detailed view
          setShowDetails(prev => !prev);
          if (!isVisible) setIsVisible(true);
        } else {
          // Ctrl+D toggles visibility
          setIsVisible(prev => !prev);
        }
      }
    };
    
    // Handle custom debug overlay event
    const handleDebugOverlay = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.show === 'boolean') {
        setIsVisible(detail.show);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('debug:show-overlay', handleDebugOverlay);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('debug:show-overlay', handleDebugOverlay);
    };
  }, [isVisible, forceVisible]);
  
  // Measure components when visible or components change
  useEffect(() => {
    if (!isVisible) {
      setBoundingBoxes([]);
      return;
    }
    
    // Clear any existing timer
    if (measurementTimerRef.current) {
      clearTimeout(measurementTimerRef.current);
    }
    
    // Delay measurement to ensure DOM is updated
    // Increased delay for renderer to ensure all components are mounted
    const delay = forceVisible ? 300 : 100;
    measurementTimerRef.current = setTimeout(() => {
      measureAllComponents();
    }, delay);
    
    return () => {
      if (measurementTimerRef.current) {
        clearTimeout(measurementTimerRef.current);
      }
    };
  }, [isVisible, activeComponents, slideId, showDetails]);
  
  const calculateTextOverflow = (element: HTMLElement, containerBounds: any, slideScale: {scaleX: number, scaleY: number}, componentType: string) => {
    // Get all text content from the actual rendered element
    const textContent = element.textContent || '';
    const totalCharacterCount = textContent.length;
    
    // If no text, return early
    if (totalCharacterCount === 0) {
      return {
        totalCharacterCount: 0,
        visibleCharacterCount: 0,
        overflowCharacterCount: 0
      };
    }
    
    // Get the container element for more accurate measurement
    const container = element.querySelector('.ProseMirror') || 
                     element.querySelector('.text-content') || 
                     element;
    
    if (!container) {
      return {
        totalCharacterCount,
        visibleCharacterCount: totalCharacterCount,
        overflowCharacterCount: 0
      };
    }
    
    // Get the computed styles from the actual text element
    const computedStyle = window.getComputedStyle(container);
    
    // Create a clone of the container for measurement
    const measureEl = document.createElement('div');
    
    // Copy all relevant styles
    const stylesToCopy = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 
      'lineHeight', 'letterSpacing', 'wordSpacing', 'textTransform',
      'textIndent', 'whiteSpace', 'wordBreak', 'overflowWrap',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'textAlign', 'direction'
    ];
    
    stylesToCopy.forEach(prop => {
      measureEl.style[prop as any] = computedStyle[prop as keyof CSSStyleDeclaration] as string;
    });
    
    // Set container dimensions - containerBounds are already in slide coordinates
    // Convert to screen pixels using the scale
    measureEl.style.width = `${containerBounds.width * slideScale.scaleX}px`;
    measureEl.style.height = `${containerBounds.height * slideScale.scaleY}px`;
    measureEl.style.position = 'absolute';
    measureEl.style.visibility = 'hidden';
    measureEl.style.overflow = 'hidden';
    measureEl.style.left = '-9999px';
    measureEl.style.top = '0';
    measureEl.style.boxSizing = 'border-box';
    
    // For TiptapTextBlock, we need to create the proper structure
    if (componentType === 'TiptapTextBlock') {
      measureEl.innerHTML = container.innerHTML;
      measureEl.className = container.className;
    }
    
    document.body.appendChild(measureEl);
    
    // First check if all text fits
    if (componentType === 'TiptapTextBlock') {
      // For Tiptap, check the scrollHeight of the content
      const measureContent = measureEl.querySelector('.ProseMirror') || measureEl;
      if (measureContent.scrollHeight <= measureEl.clientHeight && 
          measureContent.scrollWidth <= measureEl.clientWidth) {
        document.body.removeChild(measureEl);
        return {
          totalCharacterCount,
          visibleCharacterCount: totalCharacterCount,
          overflowCharacterCount: 0
        };
      }
    } else {
      measureEl.textContent = textContent;
      if (measureEl.scrollHeight <= measureEl.clientHeight && 
          measureEl.scrollWidth <= measureEl.clientWidth) {
        document.body.removeChild(measureEl);
        return {
          totalCharacterCount,
          visibleCharacterCount: totalCharacterCount,
          overflowCharacterCount: 0
        };
      }
    }
    
    // For simple calculation, check if content height exceeds container
    let overflowCharacterCount = 0;
    let visibleCharacterCount = totalCharacterCount;
    
    if (componentType === 'TiptapTextBlock') {
      // For TiptapTextBlock, estimate based on visible area
      const measureContent = measureEl.querySelector('.ProseMirror') || measureEl;
      const totalHeight = measureContent.scrollHeight;
      const visibleHeight = measureEl.clientHeight;
      
      if (totalHeight > visibleHeight) {
        // Estimate visible characters based on height ratio
        const visibleRatio = Math.min(1, visibleHeight / totalHeight);
        visibleCharacterCount = Math.floor(totalCharacterCount * visibleRatio);
        overflowCharacterCount = totalCharacterCount - visibleCharacterCount;
      }
    } else {
      // Binary search for other text types
      let low = 0;
      let high = totalCharacterCount;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        measureEl.textContent = textContent.substring(0, mid);
        
        const hasOverflow = measureEl.scrollHeight > measureEl.clientHeight || 
                           measureEl.scrollWidth > measureEl.clientWidth;
        
        if (hasOverflow) {
          high = mid - 1;
          visibleCharacterCount = Math.max(0, mid - 1);
        } else {
          low = mid + 1;
        }
      }
      
      overflowCharacterCount = Math.max(0, totalCharacterCount - visibleCharacterCount);
    }
    
    document.body.removeChild(measureEl);
    
    return {
      totalCharacterCount,
      visibleCharacterCount,
      overflowCharacterCount
    };
  };

  const isTextComponent = (type: string) => {
    return type === 'TiptapTextBlock' || type === 'TextBlock' || type === 'ShapeWithText';
  };

  const measureAllComponents = () => {
    // Get ALL components, not just text ones
    const allComponents = activeComponents.filter(c => 
              c.type !== 'Background' && !(c.id && c.id.toLowerCase().includes('background'))
    );
    
    // Find the slide container first to ensure we have the right reference
    const slideContainers = document.querySelectorAll('.slide-container');
    
    let slideContainer: HTMLElement | null = null;
    
    // Find the active slide container
    slideContainers.forEach(container => {
      const containerSlideId = container.getAttribute('data-slide-id');
      
      // More flexible matching - check if this container has our components
      const hasOurComponents = allComponents.some(comp => 
        container.querySelector(`[data-component-id="${comp.id}"]`)
      );
      
      if (hasOurComponents || 
          (slideId && containerSlideId === slideId) || 
          (activeComponents[0]?.slideId && containerSlideId === activeComponents[0]?.slideId)) {
        slideContainer = container as HTMLElement;
      }
    });
    
    if (!slideContainer) {
      return;
    }
    
    const slideRect = slideContainer.getBoundingClientRect();
    const slideWidth = parseInt(slideContainer.getAttribute('data-slide-width') || '1920');
    const slideHeight = parseInt(slideContainer.getAttribute('data-slide-height') || '1080');
    
    const measurements: BoundingBoxInfo[] = [];
    const allContentBounds: Array<{id: string, bounds: any}> = [];
    
    allComponents.forEach(component => {
      const element = document.querySelector(`[data-component-id="${component.id}"]`) as HTMLElement;
      if (!element) {
        return;
      }
      
      // Get container bounds from the component props
      const containerBounds = {
        x: component.props?.x || 0,
        y: component.props?.y || 0,
        width: component.props?.width || 100,
        height: component.props?.height || 100
      };
      
      const isText = isTextComponent(component.type);
      let contentBounds: any = null;
      let textElementBounds: any[] = [];
      
      if (isText) {
        // For text components, measure text content specifically
      let textElements: Element[] = [];
      
      if (component.type === 'TiptapTextBlock') {
        const proseMirror = element.querySelector('.ProseMirror');
        if (proseMirror) {
          textElements = Array.from(proseMirror.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th'));
        }
      } else if (component.type === 'TextBlock') {
        const textContent = element.querySelector('.text-content');
        if (textContent) {
          textElements = Array.from(textContent.querySelectorAll('p, span, div')) || [textContent];
        }
      } else if (component.type === 'ShapeWithText') {
        const proseMirror = element.querySelector('.ProseMirror');
        if (proseMirror) {
          textElements = Array.from(proseMirror.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'));
        }
      }
      
        if (textElements.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      textElements.forEach(textEl => {
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const rects = range.getClientRects();
        
        if (rects.length > 0) {
          for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            if (rect.width > 0 && rect.height > 0) {
              minX = Math.min(minX, rect.left);
              minY = Math.min(minY, rect.top);
              maxX = Math.max(maxX, rect.right);
              maxY = Math.max(maxY, rect.bottom);
              
              if (showDetails) {
                textElementBounds.push({
                  rect: rect,
                  text: textEl.textContent?.trim().substring(0, 50) || ''
                });
              }
            }
          }
        }
      });
      
          if (minX !== Infinity) {
            contentBounds = {
        x: minX,
        y: minY,
        width: maxX - minX,
              height: maxY - minY
            };
          }
        }
      } else {
        // For non-text components, use the element's actual bounds
        const rect = element.getBoundingClientRect();
        contentBounds = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        };
      }
      
      // If we couldn't get content bounds, use element bounds
      if (!contentBounds) {
        const rect = element.getBoundingClientRect();
        contentBounds = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        };
      }
      
      const scaleX = slideWidth / slideRect.width;
      const scaleY = slideHeight / slideRect.height;
      
      const scaledContentBounds = {
        x: (contentBounds.x - slideRect.left) * scaleX,
        y: (contentBounds.y - slideRect.top) * scaleY,
        width: contentBounds.width * scaleX,
        height: contentBounds.height * scaleY
      };
      
      // Check if content overflows container
      const hasContainerOverflow = 
        scaledContentBounds.width > containerBounds.width ||
        scaledContentBounds.height > containerBounds.height ||
        scaledContentBounds.x < containerBounds.x ||
        scaledContentBounds.y < containerBounds.y ||
        scaledContentBounds.x + scaledContentBounds.width > containerBounds.x + containerBounds.width ||
        scaledContentBounds.y + scaledContentBounds.height > containerBounds.y + containerBounds.height;
      
      // Calculate text overflow only for text components
      let overflowInfo = {
        totalCharacterCount: 0,
        visibleCharacterCount: 0,
        overflowCharacterCount: 0
      };
      
      if (isText && hasContainerOverflow) {
        // Get text content for character counting
        const textContent = element.textContent || '';
        const charCount = textContent.length;
        
        // For a simple approximation when content exceeds container
        if (scaledContentBounds.height > containerBounds.height) {
          // Calculate ratio of overflow
          const visibleRatio = containerBounds.height / scaledContentBounds.height;
          const visibleChars = Math.floor(charCount * visibleRatio);
          const overflowChars = charCount - visibleChars;
          
          overflowInfo = {
            totalCharacterCount: charCount,
            visibleCharacterCount: visibleChars,
            overflowCharacterCount: overflowChars
          };
          
        } else {
          // If width overflow or complex overflow, use the detailed calculation
          overflowInfo = calculateTextOverflow(element, containerBounds, {scaleX: 1/scaleX, scaleY: 1/scaleY}, component.type);
        }
      }
      
      // Convert text element bounds to slide coordinates if in detailed view
      const convertedTextElementBounds = showDetails && isText ? textElementBounds.map(item => ({
        x: (item.rect.left - slideRect.left) * scaleX,
        y: (item.rect.top - slideRect.top) * scaleY,
        width: item.rect.width * scaleX,
        height: item.rect.height * scaleY,
        text: item.text
      })) : undefined;
      
      // Store content bounds for overlap checking
      allContentBounds.push({
        id: component.id,
        bounds: scaledContentBounds
      });
      
      measurements.push({
        componentId: component.id,
        componentType: component.type,
        contentBounds: scaledContentBounds,
        containerBounds,
        hasOverflow: hasContainerOverflow,
        textElementBounds: convertedTextElementBounds,
        isTextComponent: isText,
        ...overflowInfo
      });
    });
    
    // Check for overlaps between components
    measurements.forEach((measurement, index) => {
      const overlapsWithIds: string[] = [];
      let hasComponentOverlap = false;
      
      // Check against all other components
      for (let i = 0; i < allContentBounds.length; i++) {
        if (i === index) continue; // Skip self
        
        const other = allContentBounds[i];
        const bounds1 = measurement.contentBounds;
        const bounds2 = other.bounds;
        
        // Check if rectangles overlap
        const overlapping = !(
          bounds1.x + bounds1.width <= bounds2.x ||
          bounds2.x + bounds2.width <= bounds1.x ||
          bounds1.y + bounds1.height <= bounds2.y ||
          bounds2.y + bounds2.height <= bounds1.y
        );
        
        if (overlapping) {
          hasComponentOverlap = true;
          overlapsWithIds.push(other.id);
        }
      }
      
      // Determine overflow type
      const hasContainerOverflow = measurement.hasOverflow;
      if (hasContainerOverflow && hasComponentOverlap) {
        measurement.overflowType = 'both';
      } else if (hasContainerOverflow) {
        measurement.overflowType = 'container';
      } else if (hasComponentOverlap) {
        measurement.overflowType = 'overlap';
      }
      
      // Update the overflow status to include overlaps
      measurement.hasOverflow = hasContainerOverflow || hasComponentOverlap;
      measurement.overlapsWithIds = overlapsWithIds;
    });
    
    setBoundingBoxes(measurements);
  };
  
  // Don't return null if we're visible but haven't measured yet - allow the component to render
  // This fixes the race condition where forceVisible is true but measurement hasn't completed
  if (!isVisible) {
    return null;
  }
  
  if (boundingBoxes.length === 0) {
    // Return an empty container to keep the component mounted while measurement happens
    return <div style={{ display: 'none' }} />;
  }
  
  // The overlay should be rendered at the original slide dimensions (1920x1080)
  // because the parent slide is scaled using CSS transform
  const slideWidth = 1920;
  const slideHeight = 1080;
  
  return (
    <div 
      className="absolute pointer-events-none" 
      style={{ 
        isolation: 'isolate',
        top: 0,
        left: 0,
        width: `${slideWidth}px`,
        height: `${slideHeight}px`,
        position: 'absolute',
        zIndex: 100
      }}
    >
      {boundingBoxes.map(box => {
        
        return (
        <React.Fragment key={box.componentId}>
          {/* Container bounds (dashed) */}
          <div
              className="bounding-box-overlay"
            style={{
                position: 'absolute',
                left: `${box.containerBounds.x}px`,
                top: `${box.containerBounds.y}px`,
                width: `${box.containerBounds.width}px`,
                height: `${box.containerBounds.height}px`,
                border: '2px dashed rgba(59, 130, 246, 0.8)',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                pointerEvents: 'none'
              }}
            >
              <div style={{ 
                position: 'absolute',
                top: '-24px',
                left: '0',
                fontSize: '14px',
                backgroundColor: 'rgb(59, 130, 246)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                zIndex: 10
              }}>
              Container
            </div>
          </div>
          
          {/* Content bounds (solid) */}
          <div
              className="bounding-box-overlay"
              style={{
                position: 'absolute',
                left: `${box.contentBounds.x}px`,
                top: `${box.contentBounds.y}px`,
                width: `${box.contentBounds.width}px`,
                height: `${box.contentBounds.height}px`,
                border: `2px solid ${box.hasOverflow ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 197, 94, 0.8)'}`,
                backgroundColor: box.hasOverflow ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                pointerEvents: 'none'
              }}
            >
              {/* Move status to top */}
              <div 
                className="overflow-indicator"
                style={{
                  position: 'absolute',
                  top: '-24px',
                  left: '0',
                  backgroundColor: box.hasOverflow ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)',
                  color: 'white',
                  fontSize: '14px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  whiteSpace: 'nowrap',
                  zIndex: 10
              }}
            >
              {!box.hasOverflow ? 'FITS' : 
                 box.overflowType === 'container' ? (box.isTextComponent && box.overflowCharacterCount ? `OVERFLOW: ${box.overflowCharacterCount} chars` : 'OVERFLOW') :
               box.overflowType === 'overlap' ? 'OVERLAPPING' :
                 (box.isTextComponent && box.overflowCharacterCount ? `OVERFLOW: ${box.overflowCharacterCount} chars + OVERLAP` : 'OVERFLOW + OVERLAP')} | {box.componentType}
              </div>
          </div>
          
            {/* Individual text element bounds (detailed view) - only for text components */}
            {showDetails && box.isTextComponent && box.textElementBounds && box.textElementBounds.map((textBound, idx) => (
            <div
              key={`${box.componentId}-text-${idx}`}
              className="absolute border border-dashed"
              style={{
                  left: `${textBound.x}px`,
                  top: `${textBound.y}px`,
                  width: `${textBound.width}px`,
                  height: `${textBound.height}px`,
                borderColor: 'rgba(255, 165, 0, 0.6)', // Orange for individual text lines
                backgroundColor: 'rgba(255, 165, 0, 0.05)'
              }}
            />
          ))}
          
          {/* Dimensions info */}
          <div 
            style={{
                position: 'absolute',
                left: `${box.containerBounds.x}px`,
                top: `${box.containerBounds.y + box.containerBounds.height + 10}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                fontSize: '14px',
                padding: '4px 8px',
                borderRadius: '4px',
                zIndex: 10
              }}
              data-overflow-info={box.hasOverflow && box.isTextComponent && box.overflowCharacterCount && box.overflowCharacterCount > 0 ? JSON.stringify({
                overflowCount: box.overflowCharacterCount,
                totalCount: box.totalCharacterCount
              }) : undefined}
          >
            Content: {Math.round(box.contentBounds.width)}×{Math.round(box.contentBounds.height)} | 
            Container: {Math.round(box.containerBounds.width)}×{Math.round(box.containerBounds.height)}
              {box.isTextComponent && box.hasOverflow && box.overflowCharacterCount && box.overflowCharacterCount > 0 && (
                <div style={{ color: 'rgb(248, 113, 113)', marginTop: '4px', fontSize: '12px' }}>
                  {box.overflowCharacterCount} of {box.totalCharacterCount} characters overflow
                </div>
              )}
            {box.overlapsWithIds && box.overlapsWithIds.length > 0 && (
                <div style={{ color: 'rgb(248, 113, 113)', marginTop: '4px', fontSize: '12px' }}>
                Overlaps with {box.overlapsWithIds.length} component(s)
              </div>
            )}
          </div>
        </React.Fragment>
        );
      })}
      
      {/* Instructions - only show if showLegend is true */}
      {showLegend && (
        <div 
          className="absolute bg-black/80 text-white p-4 rounded-lg max-w-xs"
          style={{
            top: '20px',
            right: '20px',
            fontSize: '14px',
            zIndex: 10
          }}
        >
          <h3 className="font-semibold mb-2">Bounding Box Viewer</h3>
        <p className="text-sm mb-2">
          Ctrl+D to toggle | Shift+Ctrl+D for details
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-dashed border-blue-500"></div>
            <span>Container bounds</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-solid border-green-500"></div>
              <span>Content (fits)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-solid border-red-500"></div>
              <span>Content (overflow/overlap)</span>
          </div>
          {showDetails && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border border-dashed border-orange-500"></div>
                <span>Text lines (text components only)</span>
            </div>
          )}
        </div>
        {showDetails && (
          <p className="text-xs mt-2 text-gray-300">
              Detailed view shows individual text lines for text components
          </p>
        )}
      </div>
      )}
    </div>
  );
};

export default TextBoundingBoxOverlay; 