import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import SlideDisplay from './SlideDisplay';
import SlideControlBar from './SlideControlBar';
import ImagePicker from './ImagePicker';
import { useImageOptions } from '@/hooks/useImageOptions';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { DeckStatus } from '@/types/DeckTypes';
import { useDeckStore } from '@/stores/deckStore';
import { AnimatePresence } from 'framer-motion';
import { GenerationProgressTracker } from '@/services/generation/GenerationProgressTracker';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { useEditorStore } from '@/stores/editorStore';
import { useToast } from '@/hooks/use-toast';

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
  
  // Toast notifications
  const { toast } = useToast();
  
  
  // Get updateComponent from ActiveSlide context
  const { updateComponent } = useActiveSlide();
  
  // Get deck data from store
  const deckData = useDeckStore(state => state.deckData);
  const deckId = deckData?.id || '';
  const deckUuid = deckData?.uuid || '';
  
  // Track slide generation progress
  const [slidesInProgress, setSlidesInProgress] = useState<Set<number>>(new Set());
  const [completedSlides, setCompletedSlides] = useState<Set<number>>(new Set());

  // Track CustomComponent prop selection (for image injection into CustomComponents)
  const [customComponentPropInfo, setCustomComponentPropInfo] = useState<{
    propName: string;
    componentId: string;
    searchQuery?: string; // Converted search term (e.g., "elon musk" from "elonMuskImage")
  } | null>(null);
  
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
    currentComponentId, // NEW: Get which component we're picking for
    hasImagePlaceholders,
    getImagePlaceholders,
    fetchImageOptions,
    selectImage,
    openImagePicker,
    closeImagePicker,
    getCurrentSlideImages,
    searchAdditionalImages,
    fetchImagesForSlide,  // NEW: Fetch images from stored search terms
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
      const { componentId, slideId, propName, searchQuery, topic, isCustomComponentProp } = event.detail || {};

      // Make sure we're on the right slide
      if (currentSlide && (slideId === currentSlide.id || !slideId)) {
        // Ensure crop mode is not active when opening the picker
        try { useEditorSettingsStore.getState().stopImageCrop(); } catch {}

        // Track CustomComponent prop info if this is for a CustomComponent
        if (isCustomComponentProp && propName && componentId) {
          setCustomComponentPropInfo({
            propName,
            componentId,
            searchQuery: searchQuery || topic || propName,
          });
        } else {
          setCustomComponentPropInfo(null);
        }

        // Open the image picker with component ID if available
        openImagePicker(currentSlide.id, componentId);
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
  const handleImageSelect = async (imageUrl: string) => {
    if (!currentSlide) {
      return;
    }

    // Cancel any active crop mode when selecting an image (except for generating placeholder)
    if (imageUrl !== 'generating://ai-image') {
      try { useEditorSettingsStore.getState().stopImageCrop(); } catch {}
    }

    // Handle CustomComponent prop selection - dispatch callback event
    if (customComponentPropInfo && imageUrl !== 'generating://ai-image') {
      const { propName, componentId, searchQuery } = customComponentPropInfo;
      console.log('[SlideContainer] CustomComponent image selection:', { propName, componentId, imageUrl: imageUrl.substring(0, 60) });

      // Helper to update HTML with a URL
      const updateHtmlWithImage = (url: string) => {
        const storeState = useEditorStore.getState();
        const currentComponents = storeState.draftComponents[currentSlide.id] || currentSlide.components || [];
        const targetComponent = currentComponents.find((c: any) => c.id === componentId);

        if (!targetComponent?.props?.render) return false;

        let html = targetComponent.props.render as string;
        const searchTerm = (searchQuery || propName)
          .replace(/Image$|Img$|Photo$|Picture$/i, '')
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .toLowerCase();
        const searchWords = searchTerm.split(' ').filter(Boolean);

        // Find and replace the matching image
        const imgRegex = /<img([^>]*)>/gi;
        let replaced = false;
        html = html.replace(imgRegex, (fullMatch, attrs) => {
          if (replaced) return fullMatch;

          const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
          const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
          const src = srcMatch ? srcMatch[1] : '';
          const alt = altMatch ? altMatch[1] : '';
          const altLower = alt.toLowerCase();

          // Check if this matches our search or is a placeholder
          const isPlaceholder = !src || src === 'placeholder' || src.includes('placeholder') ||
            (!src.startsWith('http') && !src.startsWith('data:'));
          const matchesSearch = searchWords.some(w => w.length >= 2 && altLower.includes(w));

          if (isPlaceholder || matchesSearch) {
            replaced = true;
            const newAttrs = attrs.includes('src=')
              ? attrs.replace(/src=["'][^"']*["']/i, `src="${url}"`)
              : ` src="${url}"` + attrs;
            return `<img${newAttrs}>`;
          }
          return fullMatch;
        });

        if (replaced) {
          storeState.updateDraftComponent(currentSlide.id, componentId, {
            props: { ...targetComponent.props, render: html }
          });
          return true;
        }
        return false;
      };

      // STEP 1: Immediately show a loading placeholder (data URI of a simple loading image)
      const loadingPlaceholder = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#1a1a2e" width="400" height="300"/><text x="200" y="150" text-anchor="middle" fill="#666" font-family="system-ui" font-size="14">Loading image...</text></svg>`);
      updateHtmlWithImage(loadingPlaceholder);
      console.log('[SlideContainer] Applied loading placeholder immediately');

      let finalUrl = imageUrl;

      // STEP 2: Proxy external images through our backend to Supabase
      if (imageUrl.startsWith('http') && !imageUrl.includes('supabase') && !imageUrl.includes('nextslide')) {
        try {
          console.log('[SlideContainer] Proxying external image to Supabase...');

          const response = await fetch('/api/media/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: imageUrl })
          });

          const data = await response.json();
          console.log('[SlideContainer] Proxy response:', data);

          if (response.ok && data.success && data.url) {
            finalUrl = data.url;
            console.log('[SlideContainer] Proxied URL:', finalUrl);
          } else {
            console.warn('[SlideContainer] Proxy failed, using original URL:', data.error || 'Unknown error');
          }
        } catch (error) {
          console.error('[SlideContainer] Error proxying image for CustomComponent:', error);
        }
      }

      // STEP 3: Update with the final URL
      console.log('[SlideContainer] Updating CustomComponent HTML with final image:', { componentId, propName, imageUrl: finalUrl.substring(0, 60) });
      if (updateHtmlWithImage(finalUrl)) {
        toast({
          title: "Image applied",
          description: "The image has been added to your slide",
          duration: 2000,
        });
      }

      setCustomComponentPropInfo(null);
      return;
    }

    // Legacy handling for non-CustomComponent (keeping existing code path)
    if (customComponentPropInfo) {
      setCustomComponentPropInfo(null);
      return;
    }

    // Reset potentially masking image effects when a real image is applied
    const effectSafetyReset = {
      filterPreset: 'none' as const,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 0,
      sepia: 0,
      hueRotate: 0,
      blur: 0,
      invert: 0,
      overlayColor: '#00000000',
      overlayOpacity: 0,
      overlayBlendMode: 'normal' as const,
      overlayPattern: 'none' as const,
      overlayPatternOpacity: 0.5,
      gradientOverlayEnabled: false,
      gradientStartColor: '#000000',
      gradientEndColor: '#ffffff',
      gradientDirection: 0,
      maskShape: 'none' as const,
      maskSize: 100,
      duotoneEnabled: false,
      glitchEnabled: false,
      glitchIntensity: 50,
    };
    
    // NEW: If we have a currentComponentId, apply to THAT specific component
    if (currentComponentId) {
      const targetComponent = currentSlide.components.find(c => c.id === currentComponentId);
      if (targetComponent) {
        // Track if this is a generating component
        if (imageUrl === 'generating://ai-image') {
          generatingComponentRef.current = currentComponentId;
        }
        
        updateComponent(currentComponentId, {
          props: {
            src: imageUrl,
            isGenerating: imageUrl === 'generating://ai-image',
            userSetSrc: imageUrl !== 'generating://ai-image',
            cropRect: { left: 0, top: 0, right: 0, bottom: 0 },
            cropOriginalFrame: undefined,
            cropResizesCanvas: undefined,
            ...(imageUrl !== 'generating://ai-image' ? effectSafetyReset : {})
          }
        });
        
        updateSlide(currentSlide.id, {
          components: currentSlide.components.map(c => 
            c.id === currentComponentId 
              ? { ...c, props: { ...c.props, src: imageUrl, isGenerating: imageUrl === 'generating://ai-image', userSetSrc: imageUrl !== 'generating://ai-image', cropRect: { left: 0, top: 0, right: 0, bottom: 0 }, cropOriginalFrame: undefined, cropResizesCanvas: undefined, ...(imageUrl !== 'generating://ai-image' ? effectSafetyReset : {}) } }
              : c
          )
        });
        
        // Close picker after applying to specific component (unless generating)
        if (imageUrl !== 'generating://ai-image') {
          closeImagePicker();
        }
        return;
      }
    }
    
    // FALLBACK: Old behavior - find first empty placeholder
    // Check if this is an update to a generating component
    if (generatingComponentRef.current && imageUrl !== 'generating://ai-image') {
      const componentId = generatingComponentRef.current;
      
      updateComponent(componentId, {
        props: {
          src: imageUrl,
          isGenerating: false,
          userSetSrc: true,
          cropRect: { left: 0, top: 0, right: 0, bottom: 0 },
          cropOriginalFrame: undefined,
          cropResizesCanvas: undefined,
          ...effectSafetyReset,
        }
      });
      
      updateSlide(currentSlide.id, {
        components: currentSlide.components.map(c => 
          c.id === componentId 
            ? { ...c, props: { ...c.props, src: imageUrl, isGenerating: false, userSetSrc: true, cropRect: { left: 0, top: 0, right: 0, bottom: 0 }, cropOriginalFrame: undefined, cropResizesCanvas: undefined, ...effectSafetyReset } }
            : c
        )
      });
      
      generatingComponentRef.current = null;
      return;
    }
    
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
          ...(imageUrl !== 'generating://ai-image' ? effectSafetyReset : {})
        }
      });
      
      updateSlide(currentSlide.id, {
        components: currentSlide.components.map(c => 
          c.id === emptyPlaceholder.id 
            ? { ...c, props: { ...c.props, src: imageUrl, isGenerating: imageUrl === 'generating://ai-image', ...(imageUrl !== 'generating://ai-image' ? { userSetSrc: true } : {}), ...(imageUrl !== 'generating://ai-image' ? { cropRect: { left: 0, top: 0, right: 0, bottom: 0 }, cropOriginalFrame: undefined, cropResizesCanvas: undefined } : {}), ...(imageUrl !== 'generating://ai-image' ? effectSafetyReset : {}) } }
            : c
        )
      });
    }
    
    if (imageUrl === 'generating://ai-image') {
      return;
    }
    
    const filledCount = placeholders.filter(p => {
      const src = p.props.src;
      return src && 
             src !== 'placeholder' && 
             src !== '/placeholder.svg' && 
             src !== '/placeholder.png' &&
             !src.includes('/api/placeholder/') &&
             src !== 'generating://ai-image';
    }).length + (imageUrl !== 'generating://ai-image' ? 1 : 0);
    
    if (filledCount >= placeholders.length || placeholders.length === 1) {
      closeImagePicker();
    }
  };
  
  // Get current slide topics (slide-specific, memoized)
  const currentTopics = useMemo(() => {
    if (!currentSlide) return [];
    
    // Get from cache for this specific slide
    const cachedSlideData = window.__slideImageCache?.[currentSlide.id];
    const topics = cachedSlideData?.topics || cachedSlideData?.search_terms || [];
    
    // Fallback to imageOptions if cache not available
    if (topics.length === 0 && imageOptions?.slides[currentSlide.id]) {
      return imageOptions.slides[currentSlide.id].topics || [];
    }
    
    console.log(`[SlideContainer] Topics for slide ${currentSlide.id} ONLY:`, topics);
    return topics;
  }, [currentSlide?.id, imageOptions]);
  
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
  
  // Listen for slide images becoming available and show notification
  useEffect(() => {
    const handleSlideImagesAvailable = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { slideId, images } = customEvent.detail;
      
      console.log('[SlideContainer] Images available for slide:', slideId, images?.length);
      // Toast removed - too noisy for auto-selection
    };
    
    window.addEventListener('slide_images_available', handleSlideImagesAvailable as EventListener);
    
    return () => {
      window.removeEventListener('slide_images_available', handleSlideImagesAvailable as EventListener);
    };
  }, [toast]);
  
  // Removed auto-fetch on slide change to ensure searches only run when picker opens

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
        {isPickerOpen && currentSlide && (() => {
          // Get component info if picking for specific component
          let componentInfo = null;
          if (currentComponentId) {
            const component = currentSlide.components?.find((c: any) => c.id === currentComponentId);

            // Check if this is for a CustomComponent prop
            if (customComponentPropInfo && customComponentPropInfo.componentId === currentComponentId) {
              // Use the converted searchQuery (e.g., "elon musk" instead of "elonMuskImage")
              const searchTerm = customComponentPropInfo.searchQuery || customComponentPropInfo.propName;
              componentInfo = {
                componentId: currentComponentId,
                topic: searchTerm,
                searchQuery: searchTerm,
                isCustomComponentProp: true,
              };
            } else if (component && component.type === 'Image' && component.props.metadata) {
              componentInfo = {
                componentId: currentComponentId,
                topic: component.props.metadata.topic,
                searchQuery: component.props.metadata.searchQuery,
                alt: component.props.alt
              };
            }
          }

          return (
            <ImagePicker
              images={getCurrentSlideImages(currentSlide.id)}
              onImageSelect={handleImageSelect}
              onClose={() => {
                setCustomComponentPropInfo(null);
                closeImagePicker();
              }}
              onLoadMore={(topic) => {
                // If picking for specific component, search for its topic
                const searchTopic = componentInfo?.topic || componentInfo?.searchQuery || topic;
                return searchAdditionalImages(searchTopic);
              }}
              selectedImages={selectedImages[currentSlide.id] || []}
              placeholderCount={placeholders.length}
              slideTitle={currentSlide.title || ''}
              topics={currentTopics}
              isLoading={isLoadingImages}
              targetAspectRatio={computeTargetAspectRatio()}
              suggestedImagePrompt={deckData?.outline?.slides?.[currentSlideIndex]?.suggestedImagePrompt}
              componentInfo={componentInfo} // NEW: Pass component-specific info
            />
          );
        })()}
      </AnimatePresence>
      
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
