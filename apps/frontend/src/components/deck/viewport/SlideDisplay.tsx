import React, { useRef, useEffect, memo, useState, useCallback } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';

import { DeckStatus } from '@/types/DeckTypes';
import { useMultiSelection } from '@/hooks/useMultiSelection';
import SelectionRectangle from '@/components/SelectionRectangle';
import { useEditorStore } from '@/stores/editorStore';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import GroupContextMenu from '@/components/GroupContextMenu';
import SimpleSlideDisplay from './SimpleSlideDisplay';
import SlideGeneratingUI, { LoaderBrandTheme } from '../../common/SlideGeneratingUI';
import { useTheme } from 'next-themes';
import { useDeckStore } from '@/stores/deckStore';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { GenerationProgressTracker, ProgressState } from '@/services/generation/GenerationProgressTracker';

interface SlideDisplayProps {
  slides: SlideData[];
  currentSlideIndex: number;
  direction: 'next' | 'prev' | null;
  isEditing: boolean;
  selectedComponentId?: string;
  onComponentSelect: (component: ComponentInstance) => void;
  onComponentDeselect: () => void;
  updateSlide: (id: string, data: Partial<SlideData>) => void;
  slideWidth: number;
  slideHeight: number;
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
  slideWidth,
  slideHeight,
  deckStatus,
  isNewDeck
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  // Track generation progress from the tracker
  const [progressState, setProgressState] = useState<ProgressState | null>(null);

  // Subscribe to progress tracker updates
  useEffect(() => {
    const tracker = GenerationProgressTracker.getInstance();
    const handleUpdate = (state: ProgressState) => {
      setProgressState(state);
    };
    tracker.on('update', handleUpdate);
    tracker.on('progressUpdate', handleUpdate);
    // Get initial state
    setProgressState(tracker.getState());
    return () => {
      tracker.off('update', handleUpdate);
      tracker.off('progressUpdate', handleUpdate);
    };
  }, []);

  // Calculate slides completed and in progress from tracker state
  const slidesCompleted = progressState?.slides?.filter(s => s.status === 'completed').length || 0;
  const slidesInProgress = progressState?.slides?.filter(s => s.status === 'generating').length || 0;
  const elapsedTime = progressState?.elapsedTime || 0;

  const deckData = useDeckStore(state => state.deckData);
  const isSyncing = useDeckStore(state => state.isSyncing);
  // Get deck's lastModified to force re-render on restore
  const lastModified = useDeckStore(state => state.deckData.lastModified);

  // Track how long we've been showing "Loading presentation..." with no slides
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasRetriedRef = useRef(false);

  // Retry loading the deck from the store
  const retryLoadDeck = useCallback(() => {
    const deckId = useDeckStore.getState().deckData?.uuid;
    if (!deckId) {
      // No deck ID in store - try to extract from URL
      const pathParts = window.location.pathname.split('/');
      const deckIndex = pathParts.findIndex(part => part === 'deck');
      const urlDeckId = deckIndex !== -1 ? pathParts[deckIndex + 1] : null;
      if (urlDeckId) {
        useDeckStore.getState().initialize?.({ deckId: urlDeckId, isNewDeck: false, syncEnabled: true });
      } else {
        window.location.reload();
      }
      return;
    }
    useDeckStore.getState().initialize?.({ deckId, isNewDeck: false, syncEnabled: true });
  }, []);

  useEffect(() => {
    if (slides.length === 0 && !isNewDeck) {
      // Start tracking loading time
      setLoadingElapsed(0);
      hasRetriedRef.current = false;
      loadingTimerRef.current = setInterval(() => {
        setLoadingElapsed(prev => prev + 1);
      }, 1000);
    } else {
      // Clear timer when slides are available
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoadingElapsed(0);
    }
    return () => {
      if (loadingTimerRef.current) {
        clearInterval(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    };
  }, [slides.length, isNewDeck]);

  // Auto-retry once after 8 seconds if still no slides and not syncing
  useEffect(() => {
    if (loadingElapsed >= 8 && !isSyncing && slides.length === 0 && !isNewDeck && !hasRetriedRef.current) {
      hasRetriedRef.current = true;
      console.log('[SlideDisplay] Auto-retrying deck load after timeout');
      retryLoadDeck();
    }
  }, [loadingElapsed, isSyncing, slides.length, isNewDeck, retryLoadDeck]);
  
  const loaderBrand = React.useMemo<LoaderBrandTheme>(() => {
    const stylePrefs = (deckData?.outline?.stylePreferences || (deckData as any)?.data?.outline?.stylePreferences || {}) as any;
    const styleColors = stylePrefs?.colors || {};
    const deckTheme = (deckData as any)?.theme || deckData?.data?.theme || (deckData as any)?.workspaceTheme || (deckData as any)?.data?.workspaceTheme;
    const palette = deckTheme?.color_palette || deckTheme?.palette || deckTheme?.colorPalette || deckTheme?.colors || {};
    const paletteMeta = palette?.metadata || deckTheme?.metadata || {};

    const pickString = (...values: Array<any>) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return undefined;
    };

    const accent = pickString(
      styleColors?.accent1,
      palette?.accent_1,
      palette?.accent1,
      palette?.accent,
      Array.isArray(palette?.colors) ? String(palette.colors[0]) : undefined
    );
    const accentAlt = pickString(
      styleColors?.accent2,
      palette?.accent_2,
      palette?.accent2,
      Array.isArray(palette?.colors) ? String(palette.colors[1]) : undefined,
      accent
    );
    const background = pickString(
      styleColors?.background,
      palette?.primary_background,
      Array.isArray(palette?.backgrounds) ? String(palette.backgrounds[0]) : undefined
    );
    const text = pickString(
      styleColors?.text,
      palette?.primary_text,
      palette?.text_colors?.primary
    );
    const logoUrl = pickString(
      theme === 'dark' ? stylePrefs?.logoUrlDark : undefined,
      stylePrefs?.logoUrl,
      deckTheme?.brandInfo?.logoUrl,
      paletteMeta?.logo_url,
      deckTheme?.logoUrl
    );
    const name = pickString(
      stylePrefs?.brandName,
      deckTheme?.brandInfo?.brandName,
      paletteMeta?.brand_name,
      deckData?.name
    );

    return {
      logoUrl,
      name,
      accent,
      accentAlt,
      background,
      text
    };
  }, [deckData?.outline, deckData?.data, deckData?.name, theme]);

  const outlineTitles = React.useMemo(() => {
    const outlineSlides = (deckData?.outline?.slides || (deckData as any)?.data?.outline?.slides) as any[] | undefined;
    const fromOutline = Array.isArray(outlineSlides)
      ? outlineSlides.map(slide => slide?.title).filter(Boolean)
      : [];
    if (fromOutline.length > 0) {
      return fromOutline;
    }
    return (deckData?.slides || []).map(slide => slide?.title).filter(Boolean);
  }, [deckData?.outline, deckData?.data, deckData?.slides]);

  // Get activeComponents from context for edit mode
  const { activeComponents } = useActiveSlide();

  // Get current slide for optimization
  const currentSlide = slides[currentSlideIndex] || null;
  // Check if slides have content - if they do, we're not generating regardless of status
  const hasSlideContent = slides.some(slide =>
    slide.components && slide.components.length > 0 && slide.status === 'completed'
  );

  // Check if current slide has real content (not just background)
  const currentSlideHasRealContent = React.useMemo(() => {
    if (!currentSlide?.components) return false;
    return currentSlide.components.some(
      (c) => c.type !== 'Background' && !c.id?.toLowerCase().includes('background')
    );
  }, [currentSlide?.components]);

  // Check if generation is still in progress - deckStatus takes priority over slide content
  // This ensures SVG animation shows even if some slides are already generated
  const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating' || deckStatus?.state === 'pending';

  // Only mark as completed when:
  // 1. deckStatus explicitly says 'completed'
  // 2. OR progress is at 100%
  // 3. OR no status exists but slides have content (legacy/loaded decks)
  const isCompleted = deckStatus?.state === 'completed' ||
    (deckStatus?.progress !== undefined && deckStatus.progress >= 100) ||
    (!deckStatus && hasSlideContent);
  const forceWhite = typeof window !== 'undefined' && (window as any).__tourForceWhiteBg;
  
  // Use multi-selection hook
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const { selectionRectangle, selectedComponentIds, isSelecting, suppressNextClickRef } = useMultiSelection({
    slideId: currentSlide?.id || '',
    components: isEditing ? activeComponents : (currentSlide?.components || []),
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

  const [stableBackground, setStableBackground] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (fallbackBackground) {
      setStableBackground(fallbackBackground);
    }
  }, [fallbackBackground]);

  const resolvedBackground = forceWhite ? '#ffffff' : (fallbackBackground || stableBackground || '#ffffff');
  const slideWidthComputed = slideWidth || DEFAULT_SLIDE_WIDTH;
  const slideHeightComputed = slideHeight || slideWidthComputed * (DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH);
  
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

    // Exit text editing when clicking on empty space/background
    const settings = useEditorSettingsStore.getState();
    if (settings.isTextEditing) {
      const activeEditor: any = useEditorStore.getState().activeTiptapEditor;
      try {
        activeEditor?.commands?.blur?.();
      } catch {}
      try {
        (activeEditor?.view?.dom as HTMLElement | undefined)?.blur?.();
      } catch {}
      settings.setTextEditing(false);
    }
    useEditorStore.getState().setEditingGroupId(null);

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
            style={{ width: `${slideWidthComputed}px`, height: `${slideHeightComputed}px`, background: '#ffffff' }}
          >
            {!forceWhite && (
              <span className="text-xs text-muted-foreground">Your presentation is ready</span>
            )}
          </div>
        </div>
      );
    }
    // Check if deck is generating and we need to show the generating UI
    // Show when: generating AND (no slides OR current slide has no real content)
    if (isGenerating && deckStatus && deckStatus.totalSlides > 0 && (slides.length === 0 || !currentSlideHasRealContent)) {
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
            data-slide-width={slideWidthComputed}
            data-slide-height={slideHeightComputed}
            data-native-width={DEFAULT_SLIDE_WIDTH}
            data-native-height={DEFAULT_SLIDE_HEIGHT}
            style={{
              width: `${slideWidthComputed}px`,
              height: `${slideHeightComputed}px`,
              aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
              position: 'relative',
              transition: 'none',
              margin: '0 auto',
              zIndex: isEditing ? 1 : 10,
              // Use transparent bg when showing generating UI - SlideGeneratingUI has its own background
              background: 'transparent'
            }}
            onClick={handleBackgroundClick}
            onDoubleClick={handleDoubleClick}
          >
            {!forceWhite && (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                <SlideGeneratingUI
                  slideNumber={slidesCompleted + 1}
                  totalSlides={deckStatus.totalSlides}
                  progress={progressState?.progress || deckStatus.progress || 0}
                  message={progressState?.message || deckStatus.message || "Creating your presentation"}
                  slidesCompleted={slidesCompleted}
                  slidesInProgress={slidesInProgress}
                  elapsedTime={elapsedTime}
                  brand={loaderBrand}
                  outlineTitles={outlineTitles}
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
            data-slide-width={slideWidthComputed}
            data-slide-height={slideHeightComputed}
            data-native-width={DEFAULT_SLIDE_WIDTH}
            data-native-height={DEFAULT_SLIDE_HEIGHT}
            style={{
              width: `${slideWidthComputed}px`,
              height: `${slideHeightComputed}px`,
              aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
              position: 'relative',
              transition: 'none',
              margin: '0 auto',
              zIndex: isEditing ? 1 : 10,
              // Use transparent bg when showing generating UI - SlideGeneratingUI has its own background
              background: 'transparent'
            }}
            onClick={handleBackgroundClick}
            onDoubleClick={handleDoubleClick}
          >
            {!forceWhite && (
              <div className="absolute inset-0 w-full h-full overflow-hidden">
                <SlideGeneratingUI
                  slideNumber={1}
                  totalSlides={deckStatus?.totalSlides || 1}
                  progress={progressState?.progress || 0}
                  message="Preparing your presentation"
                  slidesCompleted={0}
                  slidesInProgress={0}
                  elapsedTime={0}
                  brand={loaderBrand}
                  outlineTitles={outlineTitles}
                />
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // Determine if loading has failed: syncing finished but still no slides
    const loadingFailed = !isSyncing && loadingElapsed > 3;
    const showRetry = loadingFailed && hasRetriedRef.current;

    return (
      <div
        className="flex justify-center items-center w-full h-full relative"
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        <div
          className="aspect-[16/9] relative bg-secondary/20 rounded-sm overflow-hidden flex-shrink-0 border border-border"
          style={{ width: `${slideWidthComputed}px`, height: `${slideHeightComputed}px` }}
        >
          {showRetry ? (
            /* Loading failed after auto-retry - show error with manual retry */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
              <span
                className="font-semibold tracking-wide text-center"
                style={{
                  color: theme === 'dark' ? '#e0e0e0' : '#333333',
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontSize: '15px',
                }}
              >
                Unable to load presentation
              </span>
              <span
                className="text-center"
                style={{
                  color: theme === 'dark' ? '#999' : '#666',
                  fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                  fontSize: '12px',
                }}
              >
                Please check your connection and try again
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); retryLoadDeck(); }}
                className="mt-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                style={{
                  backgroundColor: theme === 'dark' ? '#333' : '#e5e5e5',
                  color: theme === 'dark' ? '#e0e0e0' : '#333',
                  border: `1px solid ${theme === 'dark' ? '#555' : '#ccc'}`,
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            /* Still loading or auto-retrying */
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
          )}
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
          data-slide-width={slideWidthComputed}
          data-slide-height={slideHeightComputed}
          data-native-width={DEFAULT_SLIDE_WIDTH}
          data-native-height={DEFAULT_SLIDE_HEIGHT}
          data-selection-container="true"
          style={{
            width: `${slideWidthComputed}px`,
            height: `${slideHeightComputed}px`,
            aspectRatio: `${DEFAULT_SLIDE_WIDTH} / ${DEFAULT_SLIDE_HEIGHT}`,
            position: 'relative',
            transition: 'none',
            margin: '0 auto',
            zIndex: isEditing ? 1 : 10,
            cursor: isEditing ? 'inherit' : 'default',
            pointerEvents: 'auto',
            background: resolvedBackground
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
            containerWidth={slideWidthComputed}
            containerHeight={slideHeightComputed}
            brand={loaderBrand}
            outlineTitles={outlineTitles}
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
