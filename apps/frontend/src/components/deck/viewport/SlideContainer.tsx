import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import ComponentToolbar from './ComponentToolbar';
import SlideDisplay from './SlideDisplay';
import SlideControlBar from './SlideControlBar';
import ImagePicker from './ImagePicker';
import { useEditor } from '@/hooks/useEditor';
import { useImageOptions } from '@/hooks/useImageOptions';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { DeckStatus } from '@/types/DeckTypes';
import { useDeckStore } from '@/stores/deckStore';
import { AnimatePresence } from 'framer-motion';
import { GenerationProgressTracker } from '@/services/generation/GenerationProgressTracker';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';

interface SlideContainerProps {
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

const SlideContainer: React.FC<SlideContainerProps> = ({
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
  // Reference to keep track of the slide we're currently saving
  const savingSlideRef = useRef<string | null>(null);
  
  // Get editor state for accessing draft components
  const { getComponents } = useEditor();
  
  // Get updateComponent from ActiveSlide context
  const { updateComponent } = useActiveSlide();
  
  // Get deck data from store
  const deckData = useDeckStore(state => state.deckData);
  const deckId = deckData?.id || '';
  const deckUuid = deckData?.uuid || '';
  
  // Track slide generation progress
  const [slidesInProgress, setSlidesInProgress] = useState<Set<number>>(new Set());
  const [completedSlides, setCompletedSlides] = useState<Set<number>>(new Set());
  const [isChatSelecting, setIsChatSelecting] = useState(false);
  
  // Check if deck is generating - but not if slides already have content
  const hasSlideContent = slides.some(slide => 
    slide.components && slide.components.length > 0 && slide.status === 'completed'
  );
  const isGenerating = !hasSlideContent && (deckStatus?.state === 'generating' || deckStatus?.state === 'creating');
  
  // Use image options hook
  const {
    imageOptions,
    isLoading: isLoadingImages,
    selectedImages,
    isPickerOpen,
    currentSlideId,
    hasImagePlaceholders,
    getImagePlaceholders,
    fetchImageOptions,
    selectImage,
    openImagePicker,
    closeImagePicker,
    getCurrentSlideImages,
    searchAdditionalImages,
  } = useImageOptions(deckId, deckUuid);
  
  // Check if current slide has image placeholders
  const currentSlide = slides[currentSlideIndex];
  const hasPlaceholders = currentSlide ? hasImagePlaceholders(currentSlide) : false;
  const placeholders = currentSlide ? getImagePlaceholders(currentSlide) : [];
  
  // Note: Image cache population is handled by the generation process
  // We don't need to populate it from existing slides as that would overwrite
  // the proper topic categorization
  
  // Listen for deck generation event indicating images are ready
  useEffect(() => {
    const handleImagesReady = async (event: any) => {
      const { deck_uuid, deck_id } = event.detail || {};
      
              // Check if this event is for our deck
        if (deck_uuid === deckUuid || deck_id === deckId) {
        
        // Create deck outline for API call
        const deckOutline = {
          id: deckId,
          title: deckData?.name || 'Untitled Deck',
          slides: slides.map((slide, index) => ({
            id: slide.id,
            title: slide.title || `Slide ${index + 1}`,
            content: slide.components?.find(c => c.type === 'TiptapTextBlock')?.props?.content || ''
          }))
        };
        
        // Fetch image options
        fetchImageOptions(deckOutline);
      }
    };
    
    window.addEventListener('images_ready_for_selection', handleImagesReady);
    
    return () => {
      window.removeEventListener('images_ready_for_selection', handleImagesReady);
    };
  }, [deckId, deckUuid, slides, deckData, fetchImageOptions]);

  // Listen for chat selection toggle to hide slide edit button when chat is selecting
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const selecting = !!e.detail?.selecting;
      setIsChatSelecting(selecting);
    };
    window.addEventListener('chat:selection-mode-changed', handler as EventListener);
    return () => window.removeEventListener('chat:selection-mode-changed', handler as EventListener);
  }, []);
  
  // Listen for slide generation progress events
  useEffect(() => {
    const tracker = GenerationProgressTracker.getInstance();
    
    const handleUpdate = (state: any) => {
      // Update slides in progress and completed based on the tracker state
      if (state.slides && state.slides.length > 0) {
        const inProgress = new Set<number>();
        const completed = new Set<number>();
        
        state.slides.forEach((slide: any, index: number) => {
          if (slide.status === 'generating') {
            inProgress.add(index);
          } else if (slide.status === 'completed') {
            completed.add(index);
          }
        });
        
        setSlidesInProgress(inProgress);
        setCompletedSlides(completed);
        
        // Log progress for debugging
        console.log('[SlideContainer] Generation progress:', {
          inProgress: Array.from(inProgress),
          completed: Array.from(completed),
          total: state.slides.length
        });
      }
    };
    
    // Subscribe to tracker updates
    tracker.on('update', handleUpdate);
    
    // Also listen for DOM events as backup
    const handleSlideStarted = (event: CustomEvent) => {
      const { slide_index } = event.detail || {};
      if (slide_index !== undefined) {
        setSlidesInProgress(prev => new Set(prev).add(slide_index));
      }
    };
    
    const handleSlideCompleted = (event: CustomEvent) => {
      const { slide_index } = event.detail || {};
      if (slide_index !== undefined) {
        setSlidesInProgress(prev => {
          const next = new Set(prev);
          next.delete(slide_index);
          return next;
        });
        setCompletedSlides(prev => new Set(prev).add(slide_index));
      }
    };
    
    const handleGenerationComplete = () => {
      setSlidesInProgress(new Set());
      // Mark all slides as completed
      if (deckStatus?.totalSlides) {
        setCompletedSlides(new Set(Array.from({ length: deckStatus.totalSlides }, (_, i) => i)));
      }
    };
    
    window.addEventListener('slide_started', handleSlideStarted);
    window.addEventListener('slide_completed', handleSlideCompleted);
    window.addEventListener('deck_complete', handleGenerationComplete);
    
    return () => {
      tracker.off('update', handleUpdate);
      window.removeEventListener('slide_started', handleSlideStarted);
      window.removeEventListener('slide_completed', handleSlideCompleted);
      window.removeEventListener('deck_complete', handleGenerationComplete);
    };
  }, [deckStatus?.totalSlides]);
  
  // Listen for image placeholder selection event
  useEffect(() => {
    const handleSelectPlaceholder = (event: any) => {
      const { componentId, slideId } = event.detail || {};
      
      // Make sure we're on the right slide
      if (currentSlide && (slideId === currentSlide.id || !slideId)) {
        // Ensure crop mode is not active when opening the picker
        try { useEditorSettingsStore.getState().stopImageCrop(); } catch {}
        // Log cache state when opening picker
        console.log('[SlideContainer] Opening image picker for slide:', currentSlide.id);
        const cachedImages = window.__slideImageCache?.[currentSlide.id];
        if (cachedImages) {
          console.log('[SlideContainer] Found cached images:', {
            count: cachedImages.images?.length || 0,
            topics: cachedImages.topics
          });
        } else {
          console.log('[SlideContainer] No cached images found for slide');
        }
        
        // Open the image picker
        openImagePicker(currentSlide.id);
      }
    };
    
    window.addEventListener('image:select-placeholder', handleSelectPlaceholder);
    
    return () => {
      window.removeEventListener('image:select-placeholder', handleSelectPlaceholder);
    };
  }, [currentSlide, openImagePicker]);
  
  // Listen for slide images available event
  useEffect(() => {
    const handleSlideImagesAvailable = (event: any) => {
      const { slideId, slideIndex, images } = event.detail || {};
      
      // Check if this is for our current slide
      if (currentSlide && (slideId === currentSlide.id || slideIndex === currentSlideIndex)) {
        
        // Don't auto-open picker - let the user click the button
        // Just log that images are available
        if (hasPlaceholders && images && images.length > 0) {
        } else if (hasPlaceholders && (!images || images.length === 0)) {
        }
      }
    };
    
    window.addEventListener('slide_images_available', handleSlideImagesAvailable);
    
    return () => {
      window.removeEventListener('slide_images_available', handleSlideImagesAvailable);
    };
  }, [currentSlide, currentSlideIndex, hasPlaceholders, isPickerOpen, openImagePicker]);
  
  // Track generating components
  const generatingComponentRef = useRef<string | null>(null);

  // Listen for clicks on components to close the image picker
  useEffect(() => {
    if (!isPickerOpen) return;
    
    const handleComponentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Check if clicking on the image picker itself
      if (target.closest('.fixed.top-0')) {
        return;
      }
      
      // Check if clicking on a component, slide, or any part of the editor
      const isComponentClick = target.closest('.component-wrapper') || 
                              target.closest('[data-component-id]') ||
                              target.closest('.component-type-') ||
                              target.closest('.slide-container') ||
                              target.closest('[data-slide-id]') ||
                              target.closest('.aspect-ratio');
      
      if (isComponentClick) {
        closeImagePicker();
      }
    };
    
    // Use capture phase to catch events before they're stopped
    document.addEventListener('click', handleComponentClick, true);
    document.addEventListener('mousedown', handleComponentClick, true);
    
    return () => {
      document.removeEventListener('click', handleComponentClick, true);
      document.removeEventListener('mousedown', handleComponentClick, true);
    };
  }, [isPickerOpen, closeImagePicker]);
  
  // Handle image selection
  const handleImageSelect = (imageUrl: string) => {
    if (!currentSlide) {
      return;
    }
    
    // Cancel any active crop mode when selecting an image (except for generating placeholder)
    if (imageUrl !== 'generating://ai-image') {
      try { useEditorSettingsStore.getState().stopImageCrop(); } catch {}
    }
    
    // Remove flushSync to prevent infinite loops - let React batch updates naturally

    // Reset potentially masking image effects when a real image is applied
    // This avoids cases where legacy/template overlays or filters hide the image until a UI change forces rerender
    const effectSafetyReset = {
      // Filters
      filterPreset: 'none' as const,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 0,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      invert: 0,
      // Color/gradient overlays
      overlayColor: '#00000000',
      overlayOpacity: 0,
      overlayBlendMode: 'normal' as const,
      overlayPattern: 'none' as const,
      overlayPatternOpacity: 0.5,
      gradientOverlayEnabled: false,
      gradientStartColor: '#000000',
      gradientEndColor: '#ffffff',
      gradientDirection: 0,
      // Masks & special effects
      maskShape: 'none' as const,
      maskSize: 100,
      duotoneEnabled: false,
      glitchEnabled: false,
      glitchIntensity: 50,
    };
    // Check if this is an update to a generating component
    if (generatingComponentRef.current && imageUrl !== 'generating://ai-image') {
      const componentId = generatingComponentRef.current;
      
      // Update the component with the actual image
      updateComponent(componentId, {
        props: {
          src: imageUrl,
          isGenerating: false,
          userSetSrc: true,
          // Reset any prior crop state so no mask persists
          cropRect: { left: 0, top: 0, right: 0, bottom: 0 },
          cropOriginalFrame: undefined,
          cropResizesCanvas: undefined,
          // Also reset effects that could mask the image
          ...effectSafetyReset,
        }
      });
      
      // Also update in the slide data
      updateSlide(currentSlide.id, {
        components: currentSlide.components.map(c => 
          c.id === componentId 
            ? { ...c, props: { ...c.props, src: imageUrl, isGenerating: false, userSetSrc: true, cropRect: { left: 0, top: 0, right: 0, bottom: 0 }, cropOriginalFrame: undefined, cropResizesCanvas: undefined, ...effectSafetyReset } }
            : c
        )
      });
      
      // Clear the ref
      generatingComponentRef.current = null;
      return;
    }
    
    // Find the first placeholder that doesn't have a real image yet
    const emptyPlaceholder = placeholders.find(placeholder => {
      const src = placeholder.props.src;
      const isEmpty = !src || 
             src === 'placeholder' || 
             src === '/placeholder.svg' || 
             src === '/placeholder.png' ||
             src.includes('/api/placeholder/') ||
             src === 'generating://ai-image';
      return isEmpty;
    });
    
    if (emptyPlaceholder) {
      // Update the component with the selected image
      
      // Track if this is a generating component
      if (imageUrl === 'generating://ai-image') {
        generatingComponentRef.current = emptyPlaceholder.id;
      }
      
      updateComponent(emptyPlaceholder.id, {
        props: {
          ...emptyPlaceholder.props,
          src: imageUrl,
          isGenerating: imageUrl === 'generating://ai-image',
          ...(imageUrl !== 'generating://ai-image' ? { userSetSrc: true } : {}),
          ...(imageUrl !== 'generating://ai-image' ? { cropRect: { left: 0, top: 0, right: 0, bottom: 0 }, cropOriginalFrame: undefined, cropResizesCanvas: undefined } : {}),
          // Reset masking effects when applying a real image (not generating placeholder)
          ...(imageUrl !== 'generating://ai-image' ? effectSafetyReset : {})
        }
      });
      
      // Also update in the slide data
      updateSlide(currentSlide.id, {
        components: currentSlide.components.map(c => 
          c.id === emptyPlaceholder.id 
            ? { ...c, props: { ...c.props, src: imageUrl, isGenerating: imageUrl === 'generating://ai-image', ...(imageUrl !== 'generating://ai-image' ? { userSetSrc: true } : {}), ...(imageUrl !== 'generating://ai-image' ? { cropRect: { left: 0, top: 0, right: 0, bottom: 0 }, cropOriginalFrame: undefined, cropResizesCanvas: undefined } : {}), ...(imageUrl !== 'generating://ai-image' ? effectSafetyReset : {}) } }
            : c
        )
      });
    }
    
    // Don't count generating images as filled
    const filledCount = placeholders.filter(p => {
      const src = p.props.src;
      return src && 
             src !== 'placeholder' && 
             src !== '/placeholder.svg' && 
             src !== '/placeholder.png' &&
             !src.includes('/api/placeholder/') &&
             src !== 'generating://ai-image';
    }).length + (imageUrl !== 'generating://ai-image' ? 1 : 0);
    
    // Don't close if we're generating an image
    if (imageUrl === 'generating://ai-image') {
      return;
    }
    
    // Close the picker if all placeholders are filled or if there's only one placeholder
    if (filledCount >= placeholders.length || placeholders.length === 1) {
      closeImagePicker();
    }
  };
  
  // Get current slide info from image options
  const currentSlideInfo = currentSlide && imageOptions?.slides[currentSlide.id];
  const currentTopics = currentSlideInfo?.topics || [];
  
  const handleSave = () => {
    // If no slides or invalid index, just return
    if (slides.length === 0 || currentSlideIndex < 0 || currentSlideIndex >= slides.length) {
      return;
    }
    
    const currentSlide = slides[currentSlideIndex];
    if (currentSlide) {
      // Mark this slide as being saved to prevent flashing
      savingSlideRef.current = currentSlide.id;
      
      // Update the slide without transition flag
      updateSlide(currentSlide.id, {});
      
      // Clear the saving reference after a delay
      setTimeout(() => {
        savingSlideRef.current = null;
      }, 1000);
    }
  };

  // Compute target aspect ratio for image generation based on the first empty placeholder
  const computeTargetAspectRatio = (): '16:9' | '1:1' | '9:16' => {
    try {
      const emptyPlaceholder = placeholders.find(placeholder => {
        const src = placeholder.props.src;
        const isEmpty = !src || 
               src === 'placeholder' || 
               src === '/placeholder.svg' || 
               src === '/placeholder.png' ||
               src.includes('/api/placeholder/') ||
               src === 'generating://ai-image';
        return isEmpty;
      }) || placeholders[0];

      const w = Math.max(1, Math.round(Number(emptyPlaceholder?.props.width) || DEFAULT_SLIDE_WIDTH));
      const h = Math.max(1, Math.round(Number(emptyPlaceholder?.props.height) || DEFAULT_SLIDE_HEIGHT));
      const ratio = w / h;
      const candidates: Array<{ key: '16:9' | '1:1' | '9:16'; value: number }> = [
        { key: '16:9', value: 16 / 9 },
        { key: '1:1', value: 1 },
        { key: '9:16', value: 9 / 16 },
      ];
      let best: '16:9' | '1:1' | '9:16' = '16:9';
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const c of candidates) {
        const d = Math.abs(ratio - c.value);
        if (d < bestDelta) {
          bestDelta = d;
          best = c.key;
        }
      }
      return best;
    } catch {
      return '16:9';
    }
  };

  const handleCancel = () => {
    // If no slides or invalid index, just return
    if (slides.length === 0 || currentSlideIndex < 0 || currentSlideIndex >= slides.length) {
      return;
    }
    
    const currentSlide = slides[currentSlideIndex];
    if (currentSlide) {
      // Cancel is now handled automatically when exiting edit mode
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isEditing) {
      // Ensure the dblclick anywhere on the slide area triggers edit mode.
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('slide:doubleclick', { 
          detail: { slideId: slides[currentSlideIndex]?.id }
        });
        window.dispatchEvent(event);
      }
    }
  };

  // Capture-phase dblclick to guarantee entering edit mode even if inner components stop propagation
  useEffect(() => {
    if (isEditing) return; // Only needed when viewing

    const handler = (e: MouseEvent) => {
      // Only react to dblclicks that happen within the slide container area
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const slideEl = document.getElementById('slide-display-container') ||
                      (document.querySelector('.slide-container') as HTMLElement | null);
      if (!slideEl) return;

      if (slideEl.contains(target)) {
        // Fire the same custom event used elsewhere
        const currentSlideId = slides[currentSlideIndex]?.id;
        if (currentSlideId) {
          window.dispatchEvent(new CustomEvent('slide:doubleclick', { detail: { slideId: currentSlideId } }));
        } else {
          window.dispatchEvent(new CustomEvent('slide:doubleclick'));
        }
      }
    };

    // Use capture to run before bubbling handlers that might stopPropagation
    document.addEventListener('dblclick', handler, true);
    return () => document.removeEventListener('dblclick', handler, true);
    // Depend on currentSlideIndex and slides so that slide id stays fresh
  }, [isEditing, currentSlideIndex, slides]);
  
  // Close image picker when exiting edit mode
  useEffect(() => {
    if (!isEditing && isPickerOpen) {
      closeImagePicker();
    }
  }, [isEditing, isPickerOpen, closeImagePicker]);

  // Add refresh handler
  useEffect(() => {
    const handleRefreshUI = () => {
      // Force a re-render to ensure UI is in sync
      // The component will re-render due to state/prop changes
    };
    
    window.addEventListener('deck:refresh-ui', handleRefreshUI);
    
    return () => {
      window.removeEventListener('deck:refresh-ui', handleRefreshUI);
    };
  }, []);

  // Determine if we're in a new deck state

  return (
    <div className="relative flex flex-col items-center w-full" 
         style={{ 
           margin: '0',
           paddingBottom: '0', 
           position: 'relative',
           transition: 'transform 0.3s ease-in-out',
           maxWidth: '1200px', // Reduced from 1400px to prevent excessive width
           width: '100%',
           marginLeft: 'auto',
           marginRight: 'auto',
           zIndex: isEditing ? 30 : 40 // Lower z-index when in edit mode
         }}
         onDoubleClick={!isEditing ? handleDoubleClick : undefined}
    >
      {/* Image picker overlay */}
      <AnimatePresence>
        {isPickerOpen && currentSlide && (
          <ImagePicker
            images={getCurrentSlideImages(currentSlide.id)}
            onImageSelect={handleImageSelect}
            onClose={closeImagePicker}
            onLoadMore={searchAdditionalImages}
            selectedImages={selectedImages[currentSlide.id] || []}
            placeholderCount={placeholders.length}
            slideTitle={currentSlide.title || ''}
            topics={currentTopics}
            isLoading={isLoadingImages}
            targetAspectRatio={computeTargetAspectRatio()}
          />
        )}
      </AnimatePresence>
      
      {/* Edit controls container */}
      <div className="h-10 mb-2 flex justify-between items-center w-full" 
           style={{ 
             transition: 'transform ease-in-out',
             width: '100%',
             maxWidth: '1400px'
           }}>
        {/* ComponentToolbar on the left */}
        {isEditing && (
          <ComponentToolbar 
            slideId={slides[currentSlideIndex]?.id}
            onComponentSelected={(componentId) => {
              if (componentId) {
                // If a component ID is provided, select that component
                const currentSlide = slides[currentSlideIndex];
                if (currentSlide) {
                  // Use draft components when in edit mode
                  const components = getComponents(currentSlide.id);
                  const component = components.find(c => c.id === componentId);
                  if (component) {
                    onComponentSelect(component);
                  }
                }
              } else {
                // If no component ID is provided, deselect the current component
                onComponentDeselect();
              }
            }}
          />
        )}
        
        {/* Spacer */}
        {!isEditing && <div className="flex-1" />}
        
        {/* Edit/Done button on the right */}
        {!isChatSelecting && (
          <button
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#FF4301]/40 bg-white/80 dark:bg-zinc-900/80 hover:bg-[#FF4301]/10 hover:border-[#FF4301] text-[#FF4301] shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 600,
              letterSpacing: '0.3px'
            }}
            data-tour="edit-button"
            onClick={() => {
              // Toggle edit mode
              window.dispatchEvent(new CustomEvent('editor:toggle-edit-mode'));
            }}
            disabled={
              // Disable the button if the current slide is generating/streaming
              currentSlide && (currentSlide.status === 'pending' || currentSlide.status === 'generating' || currentSlide.status === 'streaming') &&
              (!currentSlide.components || currentSlide.components.length === 0)
            }
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      
      {/* Slide display container */}
      <div className="flex flex-col items-center w-full" style={{ 
        transition: 'transform 0.3s ease-in-out', 
        position: 'relative',
        width: '100%',
        maxWidth: '1400px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        <SlideDisplay 
          slides={slides}
          currentSlideIndex={currentSlideIndex}
          direction={direction}
          isEditing={isEditing}
          selectedComponentId={selectedComponentId}
          onComponentSelect={onComponentSelect}
          onComponentDeselect={onComponentDeselect}
          updateSlide={updateSlide}
          zoomLevel={100} // Pass 100 so inner components don't scale
          deckStatus={deckStatus}
          isNewDeck={isNewDeck}
        />
        
        {/* Control bar is rendered inside the SlideContainer for better alignment */}
        {slides.length > 0 && (
          <div className="w-full flex justify-center" style={{ 
            marginTop: '10px',
            width: '100%',
            maxWidth: '1400px',
            marginLeft: 'auto',
            marginRight: 'auto',
            transition: 'none'
          }}>
            <SlideControlBar
              currentSlideIndex={currentSlideIndex}
              totalSlides={slides.length}
              isTransitioning={!!direction}
              isEditing={isEditing}
              goToPrevSlide={() => {
                if (currentSlideIndex > 0) {
                  // Use a custom event to navigate to previous slide
                  const event = new CustomEvent('slide:navigate', { 
                    detail: { direction: 'prev' }
                  });
                  window.dispatchEvent(event);
                }
              }}
              goToNextSlide={() => {
                if (currentSlideIndex < slides.length - 1) {
                  // Use a custom event to navigate to next slide
                  const event = new CustomEvent('slide:navigate', { 
                    detail: { direction: 'next' }
                  });
                  window.dispatchEvent(event);
                }
              }}
              zoomLevel={100}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideContainer;
