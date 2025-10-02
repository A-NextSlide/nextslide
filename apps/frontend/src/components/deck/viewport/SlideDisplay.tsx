import React, { useRef, useEffect, memo, useState } from 'react';
import Slide from '../../Slide';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

import { DeckStatus } from '@/types/DeckTypes';
import { useMultiSelection } from '@/hooks/useMultiSelection';
import SelectionRectangle from '@/components/SelectionRectangle';
import { useEditorStore } from '@/stores/editorStore';
import GroupContextMenu from '@/components/GroupContextMenu';
import SimpleSlideDisplay from './SimpleSlideDisplay';
import SlideGeneratingUI from '../../common/SlideGeneratingUI';
import { useTheme } from 'next-themes';
import { useDeckStore } from '@/stores/deckStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';

interface SlideDisplayProps {
  slides: SlideData[];
  currentSlideIndex: number;
  direction: 'next' | 'prev' | null;
  isEditing: boolean;
  selectedComponentId?: string;
  onComponentSelect: (component: ComponentInstance) => void;
  onComponentDeselect: () => void;
  updateSlide: (id: string, data: Partial<SlideData>) => void;
  zoomLevel?: number;
  deckStatus?: DeckStatus;
  isNewDeck?: boolean;
}

// Use memo to prevent unnecessary rerenders
const SlideDisplay: React.FC<SlideDisplayProps> = memo(({
  slides,
  currentSlideIndex,
  direction,
  isEditing,
  selectedComponentId,
  onComponentSelect,
  onComponentDeselect,
  updateSlide,
  zoomLevel = 100,
  deckStatus,
  isNewDeck
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const { theme } = useTheme();
  
  // Get deck's lastModified to force re-render on restore
  const lastModified = useDeckStore(state => state.deckData.lastModified);
  
  // Get activeComponents from context for edit mode
  const { activeComponents } = useActiveSlide();

  // Get current slide for optimization
  const currentSlide = slides[currentSlideIndex] || null;
  // Check if slides have content - if they do, we're not generating regardless of status
  const hasSlideContent = slides.some(slide => 
    slide.components && slide.components.length > 0 && slide.status === 'completed'
  );
  
  // Don't show generating state if slides already have content
  const isGenerating = !hasSlideContent && (deckStatus?.state === 'generating' || deckStatus?.state === 'creating');
  const isCompleted = hasSlideContent || deckStatus?.state === 'completed' || (deckStatus?.progress !== undefined && deckStatus.progress >= 100);
  const forceWhite = typeof window !== 'undefined' && (window as any).__tourForceWhiteBg;
  
  // Use multi-selection hook
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const { selectionRectangle, selectedComponentIds, isSelecting, suppressNextClickRef } = useMultiSelection({
    slideId: currentSlide?.id || '',
    components: currentSlide?.components || [],
    containerRef: slideContainerRef,
    isEditing,
    slideSize: { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT }
  });
  
  // Debug logging to verify multiselection is initialized - commented out to reduce noise
  // useEffect(() => {
  //   console.log('[SlideDisplay] Multi-selection initialized:', {
  //     slideContainerRef: slideContainerRef.current,
  //     isEditing,
  //     currentSlideId: currentSlide?.id,
  //     selectionRectangle
  //   });
  // }, [isEditing, currentSlide?.id, selectionRectangle]);
  
  // Get editor store methods
  const { isComponentSelected } = useEditorStore();
  
  // Log the entire slides array received as a prop
  if (slides) {

  }

  // Stable fallback background to prevent white flashes during updates
  const fallbackBackground = React.useMemo(() => {
    const comps = isEditing ? activeComponents : (currentSlide?.components || []);
    const bg = comps?.find(
      (comp) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
    );
    if (!bg) return undefined as string | undefined;
    const props: any = bg.props || {};
    
    // Check for gradient object first (support stops or colors alias)
    if (props.gradient && typeof props.gradient === 'object') {
      try {
        const gradient: any = props.gradient;
        const rawStops = Array.isArray(gradient.stops) ? gradient.stops : (Array.isArray(gradient.colors) ? gradient.colors : []);
        if (rawStops.length > 0) {
          const stops = rawStops
            .filter((s: any) => s && s.color)
            .map((s: any, idx: number) => {
              let position = s.position;
              if (position === undefined || position === null || isNaN(position)) {
                position = (idx / Math.max(1, rawStops.length - 1)) * 100;
              }
              // Convert 0-1 range to percentage if needed
              if (position <= 1 && rawStops.every((stop: any) => (stop.position ?? 0) <= 1)) {
                position = position * 100;
              }
              return `${s.color} ${position}%`;
            })
            .join(', ');
        
          if (!stops) return undefined as any;
        
          if (gradient.type === 'radial') {
            return `radial-gradient(circle, ${stops})`;
          }
          const angle = gradient.angle !== undefined ? gradient.angle : 135;
          return `linear-gradient(${angle}deg, ${stops})`;
        }
      } catch (e) {
        console.warn('Error creating fallback gradient:', e);
      }
    }
    
    // Check for string gradient/background
    if (typeof props.gradient === 'string' && props.gradient) return props.gradient;
    if (typeof props.background === 'string' && props.background) return props.background;
    if (props.style?.background) return props.style.background;
    
    // Fall back to solid color
    const directColor = props.backgroundColor || props.color || props.page?.backgroundColor;
    if (typeof directColor === 'string' && directColor) return directColor;
    
    return undefined as string | undefined;
  }, [isEditing, activeComponents, currentSlide?.components]);

  // Update container dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setContainerDimensions({ width, height });
      }
    };

    // Initial measurement
    updateDimensions();

    // Add resize listener
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Handle background click (or empty space)
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // Ignore the synthetic click immediately following a drag-selection
    if (suppressNextClickRef?.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // If currently dragging a selection rectangle, ignore click
    if (isSelecting) return;
    // Ignore modifier-assisted clicks; let multi-select logic handle those
    if (e.shiftKey || e.metaKey) return;

    const target = e.target as HTMLElement;
    const componentElement = target.closest('[data-component-id]') as HTMLElement | null;

    // If clicked on a non-background component, do nothing here
    if (componentElement) {
      const componentType = componentElement.getAttribute('data-component-type') || '';
      const componentIdAttr = componentElement.getAttribute('data-component-id') || '';
      const isBackgroundEl = componentType === 'Background' || componentIdAttr.toLowerCase().includes('background');
      if (!isBackgroundEl) return;
      // If it is a background element, fall through to select background below
    }

    // Find and select the background component for this slide
    const currentSlideLocal = slides[currentSlideIndex];
    const componentsToCheck = isEditing ? activeComponents : (currentSlideLocal?.components || []);

    if (componentsToCheck.length > 0) {
      const backgroundComponent = componentsToCheck.find(
        comp => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
      );
      if (backgroundComponent && onComponentSelect) {
        onComponentSelect(backgroundComponent);
      } else {
        onComponentDeselect();
      }
    } else {
      onComponentDeselect();
    }
  };
  
  // Handle double-click
  const handleDoubleClick = (e: React.MouseEvent) => {
    console.log('[SlideDisplay] Double-click detected, isEditing:', isEditing);
    
    // Only proceed if not in editing mode
    if (!isEditing) {
      // Check if current slide exists and has content
      const currentSlide = slides[currentSlideIndex];
      const hasContent = currentSlide && currentSlide.components && currentSlide.components.length > 0;
      
      console.log('[SlideDisplay] Current slide:', currentSlide?.id, 'hasContent:', hasContent);
      
      // Allow double-click if there's a slide with any components (including background)
      if (hasContent) {
        e.preventDefault();
        e.stopPropagation();
        
        if (typeof window !== 'undefined') {
          console.log('[SlideDisplay] Dispatching slide:doubleclick event');
          const event = new CustomEvent('slide:doubleclick', { 
            detail: { slideId: currentSlide.id }
          });
          window.dispatchEvent(event);
        }
      }
    }
  };
  
  // Keep a stable width to prevent layout jumps; scale is handled by parent when entering edit mode
  const slideWidth = (isGenerating || isNewDeck) ? 900 : 950;
  const slideHeight = slideWidth * (DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH);
  
  // Early return if no slides
  if (slides.length === 0) {
    // If backend indicates deck is already complete, do not show generating overlay
    if (isCompleted || forceWhite) {
      return (
        <div 
          ref={containerRef}
          className="flex justify-center items-center w-full h-full relative"
          style={{ overflow: 'hidden', position: 'relative' }}
        >
          <div 
            className="aspect-[16/9] relative rounded-sm overflow-hidden flex-shrink-0 border border-border flex items-center justify-center"
            style={{ width: `${slideWidth}px`, height: `${slideHeight}px`, background: '#ffffff' }}
          >
            {!forceWhite && (
              <span className="text-xs text-muted-foreground">Your presentation is ready</span>
            )}
          </div>
        </div>
      );
    }
    // Check if deck is generating but we have no slides at all
    if ((deckStatus?.state === 'generating' || deckStatus?.state === 'creating') && deckStatus.totalSlides > 0 && slides.length === 0) {
      // Only create placeholders if we truly have no slides
      const placeholderSlides = Array.from({ length: deckStatus.totalSlides }, (_, index) => ({
        id: `placeholder-${index}`,
        title: `Slide ${index + 1}`,
        components: [],
        status: 'pending' as const
      }));
      
      // Show the first placeholder slide
      return (
        <div 
          ref={containerRef}
          className="flex justify-center items-center w-full h-full relative" 
          style={{ 
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div id="snap-guide-portal" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          
          <div 
            id="slide-display-container"
            className={`slide-container relative rounded-sm overflow-hidden flex-shrink-0 border border-border ${isEditing ? 'editing-mode' : ''}`}
            data-slide-id={placeholderSlides[0]?.id || 'unknown'}
            data-slide-width={DEFAULT_SLIDE_WIDTH}
            data-slide-height={DEFAULT_SLIDE_HEIGHT}
            style={{
              width: `${slideWidth}px`,
              height: `${slideHeight}px`,
              aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
              position: 'relative',
              transition: 'none',
              margin: '0 auto',
              zIndex: isEditing ? 1 : 10,
              ...(forceWhite ? { background: '#ffffff' } : {})
            }}
            onClick={handleBackgroundClick}
            onDoubleClick={handleDoubleClick}
          >
            {!forceWhite && (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                <SlideGeneratingUI
                  slideNumber={1}
                  totalSlides={deckStatus.totalSlides}
                  progress={deckStatus.progress || 0}
                  message={deckStatus.message || "Creating your presentation"}
                />
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // For new decks that haven't started generating yet, show a generating placeholder
    if (isNewDeck) {
      return (
        <div 
          ref={containerRef}
          className="flex justify-center items-center w-full h-full relative" 
          style={{ 
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div id="snap-guide-portal" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          
          <div 
            id="slide-display-container"
            className={`slide-container relative rounded-sm overflow-hidden flex-shrink-0 border border-border ${isEditing ? 'editing-mode' : ''}`}
            data-slide-id="placeholder-0"
            data-slide-width={DEFAULT_SLIDE_WIDTH}
            data-slide-height={DEFAULT_SLIDE_HEIGHT}
            style={{
              width: `${slideWidth}px`,
              height: `${slideHeight}px`,
              aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
              position: 'relative',
              transition: 'none',
              margin: '0 auto',
              zIndex: isEditing ? 1 : 10,
              ...(forceWhite ? { background: '#ffffff' } : {})
            }}
            onClick={handleBackgroundClick}
            onDoubleClick={handleDoubleClick}
          >
            {!forceWhite && (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                <SlideGeneratingUI
                  slideNumber={1}
                  totalSlides={deckStatus?.totalSlides || 1}
                  progress={0}
                  message="Preparing your presentation"
                />
              </div>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div 
        className="flex justify-center items-center w-full h-full relative"
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        <div 
          className="aspect-[16/9] relative bg-secondary/20 rounded-sm overflow-hidden flex-shrink-0 border border-border"
          style={{ width: `${slideWidth}px`, height: `${slideHeight}px` }}
        >
          {/* Bottom-left loading label styled like generation UI */}
          <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
            <div className="flex items-center justify-between">
              <span 
                className="font-black tracking-wider"
                style={{ 
                  color: theme === 'dark' ? '#e0e0e0' : '#333333',
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontSize: '18.95px',
                  textTransform: 'uppercase',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale'
                }}
              >
                Loading presentation…
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex justify-center items-center w-full h-full relative" 
      style={{ 
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Add a div for the snap guide portal so it's contained in the slide */}
      <div id="snap-guide-portal" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      
      <GroupContextMenu slideId={slides[currentSlideIndex]?.id || ''}>
        <div 
          ref={slideContainerRef}
          id="slide-display-container"
          className={`slide-container relative rounded-sm overflow-hidden flex-shrink-0 border border-border ${isEditing ? 'editing-mode' : ''}`}
          data-slide-id={slides[currentSlideIndex]?.id || 'unknown'}
          data-slide-width={DEFAULT_SLIDE_WIDTH}
          data-slide-height={DEFAULT_SLIDE_HEIGHT}
          data-selection-container="true"
          style={{
            width: `${slideWidth}px`,
            height: `${slideHeight}px`,
            aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
            position: 'relative',
            transition: 'none',
            margin: '0 auto',
            zIndex: isEditing ? 1 : 10,
            cursor: isEditing ? 'crosshair' : 'default',
            pointerEvents: 'auto',
            // During guided demo, allow forcing a white background for clarity
            ...((typeof window !== 'undefined' && (window as any).__tourForceWhiteBg) ? { background: '#ffffff' } : (fallbackBackground && !isGenerating ? { background: fallbackBackground } : {}))
          }}
          onClick={handleBackgroundClick}
          onDoubleClick={handleDoubleClick}
        >
          <div className="absolute inset-0 w-full h-full overflow-hidden">
          <SimpleSlideDisplay
            slide={slides[currentSlideIndex] || null}
            slideIndex={currentSlideIndex}
            slides={slides}
            direction={direction}
            isEditing={isEditing}
            selectedComponentId={selectedComponentIds.length === 1 ? selectedComponentIds[0] : undefined}
            onComponentSelect={onComponentSelect}
            updateSlide={updateSlide}
            deckStatus={deckStatus}
          />
        </div>
        
        {/* Selection rectangle - render at slide container level */}
        {/* Disable multi-select rectangle while comments region selection is active */}
        {isEditing && selectionRectangle && !(window as any).__commentsSelectingRegion && (
          <SelectionRectangle rectangle={selectionRectangle} />
        )}

      </div>
    </GroupContextMenu>
    </div>
  );
});

SlideDisplay.displayName = "SlideDisplay";

export default SlideDisplay;