import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
// Removed font optimization service
import { GenerationCoordinator } from '@/services/generation/GenerationCoordinator';
import { useDeckStore } from '@/stores/deckStore';
import { DeckStatus } from '@/types/DeckTypes';
import '@/utils/debugImageCache'; // Import debug utilities
import { cacheAvailableImages } from '@/hooks/slideGeneration/imageCache';
import { handleImageEvents } from '@/hooks/slideGeneration/imageEvents';
import { applySlideDataToDeck, extractSlideUpdate } from '@/hooks/slideGeneration/slideUpdates';
import { useThemeEventRelay } from '@/hooks/slideGeneration/themeRelay';
import { handleOutlineStructureEvent } from '@/hooks/slideGeneration/outlinePlaceholders';
import { API_ENDPOINTS } from '@/config/apiEndpoints';
import { authService } from '@/services/authService';

const postSystemMessage = (message: string, metadata: any = {}) => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('add_system_message', {
        detail: { message, metadata }
      }));
    }
  } catch {}
};

export interface UseSlideGenerationOptions {
  onProgress?: (event: any) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// Check if a deck has text components with overflow
// Removed overflow checking tied to font optimization

export function useSlideGeneration(deckId: string, options: UseSlideGenerationOptions = {}) {
  const coordinator = useMemo(() => GenerationCoordinator.getInstance(), []);
  const [isGenerating, setIsGenerating] = useState(() => coordinator.isGenerating(deckId));
  
  // Initialize with creating state if we're already generating
  const [deckStatus, setDeckStatus] = useState<DeckStatus | null>(() => {
    if (coordinator.isGenerating(deckId)) {
      return {
        state: 'creating',
        progress: 0,
        message: 'Initializing deck generation...',
        currentSlide: 0,
        totalSlides: 0,
        startedAt: new Date().toISOString()
      };
    }
    return null;
  });
  const [lastSystemMessage, setLastSystemMessage] = useState<any>(null);
  
  // Track processed slides to prevent duplicates
  const processedSlidesRef = useRef<Set<string>>(new Set());
  
  // Track slide progress
  const slidesInProgressRef = useRef<Set<number>>(new Set());
  const completedSlidesRef = useRef<Set<number>>(new Set());
  const { handleEvent: handleThemeEvent, reset: resetThemeRelay } = useThemeEventRelay();
  
  // Track if we've created placeholder slides
  const placeholdersCreatedRef = useRef(false);
  
  // CRITICAL FIX: Store options in a ref to prevent callback recreation on every render
  // This fixes the production bug where loading state disappears due to stale closures
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Store deckStatus.startedAt in a ref to avoid stale closures in handleProgress
  const startedAtRef = useRef<string | null>(null);
  if (deckStatus?.startedAt && !startedAtRef.current) {
    startedAtRef.current = deckStatus.startedAt;
  }

  const { toast } = useToast();

  const getStateFromEvent = (event: any): 'creating' | 'generating' | 'completed' | 'error' => {
    // Map backend event types to frontend states
    switch (event.type || event.stage) {
      case 'deck_creation_started':
      case 'deck_created':
      case 'initialization':
        return 'creating';
      case 'deck_complete':
      case 'composition_complete':
        return 'completed';
      case 'slides_generation_complete':
        // Check if all slides were successful
        const data = event.data || event;
        const completed = data.completed_slides ?? data.completedSlides;
        const total = data.total_slides ?? data.totalSlides;
        const failed = data.failed_slides ?? data.failedSlides ?? 0;
        // If all slides done with no failures, mark as completed
        if (completed === total && failed === 0) {
          return 'completed';
        }
        return 'generating'; // Still in finalization
      case 'error':
      case 'slide_error':
        return 'error';
      default:
        // Any other event means we're generating
        return 'generating';
    }
  };

  // Track last message to prevent duplicates
  const lastMessageRef = useRef<{ message: string; progress: number; timestamp: number }>({ 
    message: '', 
    progress: -1,
    timestamp: 0 
  });
  
  const handleProgress = useCallback((event: any) => {
    // Log ALL events to debug what's being sent
    console.log('[useSlideGeneration] RAW EVENT:', {
      type: event.type,
      stage: event.stage,
      data: event.data,
      hasInnerData: !!(event.data && event.data.data),
      innerType: event.data?.type,
      message: event.message
    });
    
    handleThemeEvent(event);

    // Add specific logging for slide_completed events
    if (event.type === 'slide_completed' || event.type === 'slide_generated') {
      console.log('[useSlideGeneration] SLIDE_COMPLETED EVENT:', {
        type: event.type,
        slide_index: event.slide_index,
        has_slide: !!event.slide,
        slide_components: event.slide?.components?.length,
        slide_id: event.slide_id
      });
    }
    const imageResult = handleImageEvents(event, { deckId });
    if (imageResult.shouldReturnEarly) {
      return;
    }
    if (imageResult.carousel) {
      postSystemMessage('Collecting images…', {
        type: 'images_collected',
        images_by_slide: imageResult.carousel.slides,
        total_images: imageResult.carousel.totalImages,
        isLoading: false,
        showDuration: 0
      });
    }

    // Extract progress directly from backend events (source of truth)
    // Default to previous progress if this event doesn't include a progress number
    let progress = typeof deckStatus?.progress === 'number' ? deckStatus.progress : 0;
    let message = deckStatus?.message || '';
    let currentSlide = deckStatus?.currentSlide;
    let totalSlides = deckStatus?.totalSlides;
    let phase = event.phase || event.data?.phase || event.stage;

    if (event.type === 'progress' && event.data) {
      const p = event.data.progress;
      if (typeof p === 'number' && Number.isFinite(p)) {
        // clamp 0-100
        progress = Math.max(0, Math.min(100, p));
      }
      if (event.data.message) message = event.data.message;
      if (event.data.currentSlide !== undefined) currentSlide = event.data.currentSlide;
      if (event.data.totalSlides !== undefined) totalSlides = event.data.totalSlides;
      if (event.data.slideProgress) {
        if (event.data.slideProgress.current !== undefined) currentSlide = event.data.slideProgress.current;
        if (event.data.slideProgress.total !== undefined) totalSlides = event.data.slideProgress.total;
      }
    } else if (event.type === 'phase_update') {
      if (typeof event.progress === 'number' && Number.isFinite(event.progress)) {
        progress = Math.max(0, Math.min(100, event.progress));
      }
      if (event.message) message = event.message;
    } else {
      // Other events may carry progress/message
      const p = (typeof event.progress === 'number' ? event.progress : (typeof event.data?.progress === 'number' ? event.data.progress : undefined));
      if (typeof p === 'number' && Number.isFinite(p)) {
        progress = Math.max(0, Math.min(100, p));
      }
      if (event.message) message = event.message;
      else if (event.data?.message) message = event.data.message;
      // Slide counters when available
      if (event.slideIndex !== undefined) currentSlide = event.slideIndex + 1;
      if (event.slide_index !== undefined) currentSlide = event.slide_index + 1;
      if (event.slidesTotal !== undefined) totalSlides = event.slidesTotal;
      if (event.total_slides !== undefined) totalSlides = event.total_slides;
      if (event.data?.total_slides !== undefined) totalSlides = event.data.total_slides;
    }

    // Normalize certain backend messages that indicate the work already finished
    try {
      const lowerMessage = String(message || '').toLowerCase();
      if (
        lowerMessage.includes('already completed') ||
        lowerMessage.includes('already complete') ||
        lowerMessage.includes('already processed')
      ) {
        progress = 100;
        // If phase isn't set, treat as finalization
        phase = phase || 'finalization';
      }
    } catch {}

    // Completion events force progress to 100
    if (
      event.type === 'deck_complete' ||
      event.type === 'composition_complete' ||
      event.type === 'deck_completed' ||
      event.type === 'deck_rendered' ||
      event.type === 'complete'
    ) {
      progress = 100;
    }
    
    // Update deck status
    // CRITICAL FIX: Use startedAtRef instead of deckStatus?.startedAt to avoid stale closures
    // This was causing the loading state to disappear in production
    const newStartedAt = startedAtRef.current || new Date().toISOString();
    if (!startedAtRef.current) {
      startedAtRef.current = newStartedAt;
    }
    const newStatus: DeckStatus = {
      state: getStateFromEvent(event),
      progress: progress,
      message: message,
      currentSlide: currentSlide,
      totalSlides: totalSlides,
      startedAt: newStartedAt
    };

    setDeckStatus(newStatus);
    
    // Create progress message based on backend event type
    let displayMessage = message;
    
    // Determine phase from event type if not explicitly provided
    if (!phase) {
      if (event.type === 'deck_creation_started' || event.type === 'deck_created') {
        phase = 'initialization';
      } else if (event.type === 'theme_generated' || event.type === 'theme_generation') {
        phase = 'theme_generation';
      } else if (event.type === 'images_ready_for_selection' || event.type === 'image_search_started' || event.type === 'image_collection') {
        phase = 'image_collection';
      } else if (event.type === 'slide_started' || event.type === 'slide_generated' || event.type === 'slide_completed') {
        phase = 'slide_generation';
      } else if (event.type === 'deck_complete' || event.type === 'composition_complete') {
        phase = 'generation_complete';
      }
    }
    
    // Do not artificially bump progress between phases; backend percentages are authoritative
    
    // Format message based on event type
    if (event.type === 'deck_creation_started') {
      displayMessage = `Creating deck: ${event.title || 'Untitled'}`;
      // Reset slide tracking for new generation
      slidesInProgressRef.current.clear();
      completedSlidesRef.current.clear();
    } else if (event.type === 'phase_update' || (event.type === 'progress' && event.data?.phase)) {
      const phase = event.phase || event.data?.phase;
      const phaseMessages = {
        'initialization': 'Initializing deck creation',
        'theme_generation': 'Creating design theme',
        'layout_design': '📐 Creating blueprint',
        'image_collection': 'Searching for images',
        'slide_generation': 'Generating slides',
        'finalization': 'Finalizing deck'
      };
      displayMessage = phaseMessages[phase] || message;
    } else if (event.type === 'slide_started') {
      displayMessage = `Generating slide ${event.slide_index + 1}: ${event.title || ''}`;
      // Track slide as in progress
      if (event.slide_index !== undefined) {
        slidesInProgressRef.current.add(event.slide_index);
      }
    } else if (event.type === 'slide_generated' || event.type === 'slide_completed') {
      displayMessage = `Generated slide ${event.slide_index + 1}`;
      // Track slide as completed
      if (event.slide_index !== undefined) {
        slidesInProgressRef.current.delete(event.slide_index);
        completedSlidesRef.current.add(event.slide_index);
      }
    }
    
    // Filter out nonsensical messages
    if (displayMessage.includes('Generated 0 of')) {
      // Skip messages that say 0 slides generated
      return;
    }
    
    // Create system message with appropriate metadata
    const messageMetadata: any = {
      stage: event.stage || event.type,
      progress: progress,
      type: event.type || event.stage,
      currentSlide: currentSlide,
      totalSlides: totalSlides,
      phase: phase || event.phase || event.data?.phase,  // Use the phase we determined
      substep: event.substep || event.data?.substep,
      errors: event.data?.errors,
      isStreamingUpdate: true,  // ALWAYS true for generation events
      completedSlides: completedSlidesRef.current,
      slidesInProgress: slidesInProgressRef.current
    };
    
    // Check for completion events or when progress is 100%
    const msgLower = String(displayMessage || '').toLowerCase();
    if (
        event.type === 'deck_complete' || 
        event.type === 'composition_complete' ||
        event.type === 'deck_completed' ||
        event.type === 'deck_rendered' ||
        event.type === 'complete' ||
        progress === 100 ||
        msgLower.includes('already completed') ||
        msgLower.includes('already complete') ||
        msgLower.includes('already processed')) {
      const deckData = useDeckStore.getState().deckData;
      const isFontOptimized = deckData.data?.fontOptimized === true;
      

      
      // Force proper completion message when progress is 100%
      if (progress === 100) {
        displayMessage = 'Your presentation is ready!';
        messageMetadata.type = 'generation_complete';
        messageMetadata.stage = 'generation_complete';
      }

    }
    
    // Prevent sending duplicate messages
    const now = Date.now();
    const isDuplicate = lastMessageRef.current.message === displayMessage && 
                       lastMessageRef.current.progress === progress &&
                       (now - lastMessageRef.current.timestamp) < 500; // Within 500ms
    
    if (!isDuplicate) {
      // Set the system message with formatted display text
      setLastSystemMessage({
        message: displayMessage,
        metadata: messageMetadata
      });
      
      // Update last message reference
      lastMessageRef.current = {
        message: displayMessage,
        progress: progress,
        timestamp: now
      };
    } else {
    }

    if (handleOutlineStructureEvent({ event, deckId, isGenerating, placeholdersCreatedRef })) {
      return;
    }
    
    const slideUpdate = extractSlideUpdate(event);
    if (slideUpdate) {
      const { slideIndex, slideData } = slideUpdate;
      if (slideIndex !== undefined) {
        slidesInProgressRef.current.delete(slideIndex);
        completedSlidesRef.current.add(slideIndex);
      }

      const slideEventKey = `${slideIndex}_${slideData?.id || slideIndex}_${JSON.stringify(slideData).length}`;
      if (processedSlidesRef.current.has(slideEventKey)) {
        console.log(`[SlideGeneration] Skipping duplicate slide ${slideIndex}`);
        return;
      }
      processedSlidesRef.current.add(slideEventKey);

      const applied = applySlideDataToDeck({ deckId, slideIndex, slideData });
      if (!applied) {
        return;
      }

      const { slideId, updatedSlide } = applied;
      cacheAvailableImages(slideId, slideIndex, slideData);

      try {
        const resolvedIndex = slideIndex ?? (slideId
          ? useDeckStore.getState().deckData.slides.findIndex(s => s.id === slideId)
          : -1);
        if (resolvedIndex !== -1 && slideId) {
          window.dispatchEvent(new CustomEvent('slide_completed', {
            detail: {
              slideId,
              slide_id: slideId,
              slideIndex: resolvedIndex,
              slide_index: resolvedIndex,
              order: resolvedIndex,
              slide: updatedSlide,
              timestamp: Date.now()
            }
          }));

          const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages !== false;
          if (autoSelectImages) {
            setTimeout(() => {
              import('@/utils/slideImageUpdater').then(({ SlideImageUpdater }) => {
                const updater = SlideImageUpdater.getInstance();
                updater.applyImagesToNewSlide(slideId, resolvedIndex);
              }).catch(err => console.error('[SlideGeneration] Failed to auto-apply images:', err));
            }, 100);
          }
        }
      } catch {}

      options.onProgress?.(event);
      return;
    }
    
    // Handle deck_complete event from backend OR when progress reaches 100%
    if (event.type === 'deck_complete' || 
        event.type === 'composition_complete' ||
        (progress === 100 && (event.stage === 'finalization' || event.stage === 'generation_complete'))) {
      
      // Update status to completed
      // CRITICAL FIX: Use startedAtRef instead of deckStatus?.startedAt to avoid stale closures
      setDeckStatus({
        state: 'completed',
        progress: 100,
        message: 'Your presentation is ready!',
        currentSlide: totalSlides,
        totalSlides: totalSlides,
        startedAt: startedAtRef.current || new Date().toISOString()
      });
      
      // Set a proper completion message if not already set above
      if (!displayMessage.includes('Your presentation is ready!')) {
        setLastSystemMessage({
          message: 'Your presentation is ready!',
          metadata: {
            ...messageMetadata,
            type: 'generation_complete',
            stage: 'generation_complete',
            progress: 100,
            // Font optimization prompts removed
          }
        });
      }
      
      // Save the final deck state to backend
      console.log('[useSlideGeneration] Saving completed deck to backend');
      const finalDeckData = useDeckStore.getState().deckData;
      if (finalDeckData && finalDeckData.uuid) {
        // Force a save to backend
        useDeckStore.getState().updateDeckData(finalDeckData);
        console.log('[useSlideGeneration] Deck saved to backend with', finalDeckData.slides.length, 'slides');
      }
      
      // Call the onComplete callback
      options.onComplete?.();
      
      // Dispatch event that deck generation is complete
      console.log('[useSlideGeneration] Dispatching deck_generation_complete event');
      window.dispatchEvent(new CustomEvent('deck_generation_complete', {
        detail: {
          deckId: event.deck_uuid || event.deck_id || useDeckStore.getState().deckData.uuid,
          timestamp: Date.now()
        }
      }));
    }

    // Call user's progress handler via ref to avoid stale closures
    optionsRef.current.onProgress?.(event);
  }, [deckId, handleThemeEvent]); // CRITICAL FIX: Removed 'options' from dependencies - using optionsRef instead

  const handleComplete = useCallback(() => {
    setIsGenerating(false);
    // Clear processed slides for next generation
    processedSlidesRef.current.clear();
    // Clear the active generation ID
    (window as any).__activeGenerationId = null;
    // Reset startedAt ref for next generation
    startedAtRef.current = null;
    optionsRef.current.onComplete?.();
  }, []); // CRITICAL FIX: Removed 'options' from dependencies - using optionsRef instead

  const handleError = useCallback((error: Error) => {
    setIsGenerating(false);
    // Clear processed slides on error
    processedSlidesRef.current.clear();
    // Reset startedAt ref for next generation
    startedAtRef.current = null;
    // Clear the active generation ID
    (window as any).__activeGenerationId = null;
    toast({
      title: 'Generation Error',
      description: error.message,
      variant: 'destructive',
      duration: 5000,
    });
    optionsRef.current.onError?.(error);
  }, [toast]); // CRITICAL FIX: Removed 'options' from dependencies - using optionsRef instead

  const startGeneration = useCallback(async (generationOptions: any = {}) => {
    // CRITICAL: Use deckId from generationOptions if provided (for outline mode UUID consistency)
    // Otherwise use deckId from hook closure
    const effectiveDeckId = generationOptions.deckId || deckId;
    console.log('[useSlideGeneration] startGeneration called with:', {
      generationOptionsDeckId: generationOptions.deckId,
      hookDeckId: deckId,
      effectiveDeckId
    });

    if (!effectiveDeckId) {
      toast({
        title: 'Error',
        description: 'No deck ID available',
        variant: 'destructive'
      });
      return;
    }

    // Reset slide tracking but check if we should keep placeholders
    const currentDeckData = useDeckStore.getState().deckData;
    const hasExistingSlides = currentDeckData.slides && currentDeckData.slides.length > 0;

    // Check if deck already has generated content - don't start generation
    const hasGeneratedContent = currentDeckData.slides?.some((slide: any) =>
      slide.components && slide.components.length > 0
    );

    if (hasGeneratedContent) {
      console.log('[useSlideGeneration] Deck already has generated content, skipping generation start');
      // Set status to completed if not already
      setDeckStatus({
        state: 'completed',
        progress: 100,
        message: 'Your presentation is ready!',
        currentSlide: currentDeckData.slides.length,
        totalSlides: currentDeckData.slides.length,
        startedAt: new Date().toISOString()
      });
      return;
    }

    slidesInProgressRef.current.clear();
    completedSlidesRef.current.clear();
    resetThemeRelay();
    // Only reset placeholders if we don't have existing slides
    if (!hasExistingSlides) {
      placeholdersCreatedRef.current = false;
    }

    try {
      // currentDeckData already retrieved above
      const outline = (currentDeckData as any).outline || generationOptions.outline;

      console.log('[useSlideGeneration] Starting generation with deck ID:', effectiveDeckId);
      console.log('[useSlideGeneration] Outline ID:', outline?.id);

      // Start generation through coordinator - it handles all duplicate checks
      await coordinator.startGeneration({
        deckId: effectiveDeckId, // CRITICAL: Use the effective deck ID
        outline,
        prompt: generationOptions.prompt || (currentDeckData as any).prompt || currentDeckData.name,
        slideCount: generationOptions.slideCount || 6,
        detailLevel: generationOptions.detailLevel || 'standard',
        auto: generationOptions.auto,
        onProgress: handleProgress,
        onComplete: handleComplete,
        onError: handleError
      });
      
      // Show toast only if not auto-generated
      if (!generationOptions.auto) {
        toast({
          title: 'Generation Started',
          description: 'Your slides are being generated...',
          duration: 5000,
        });
      }
    } catch (error: any) {
      // Only show error if it's not a duplicate generation
      if (!error.message?.includes('already in progress')) {
        toast({
          title: 'Failed to start generation',
          description: error.message || 'An error occurred',
          variant: 'destructive'
        });
      }
    }
  }, [deckId, coordinator, handleProgress, handleComplete, handleError, resetThemeRelay, toast]);

  const stopGeneration = useCallback(async () => {
    if (!deckId) return;
    
    try {
      await coordinator.stopGeneration(deckId);
      toast({
        title: 'Generation stopped',
        description: 'Slide generation has been cancelled',
        duration: 3000
      });
    } catch (error) {
      console.error('[useSlideGeneration] Error stopping generation:', error);
    }
  }, [deckId, coordinator, toast]);
  
  // Subscribe to coordinator events
  useEffect(() => {
    const handleStart = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(true);
        processedSlidesRef.current.clear();
      }
    };

    const handleComplete = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(false);
      }
    };

    const handleError = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(false);
      }
    };

    const handleCancelled = (e: CustomEvent) => {
      if (e.detail.deckId === deckId) {
        setIsGenerating(false);
      }
    };

    coordinator.addEventListener('generation:started', handleStart as EventListener);
    coordinator.addEventListener('generation:completed', handleComplete as EventListener);
    coordinator.addEventListener('generation:failed', handleError as EventListener);
    coordinator.addEventListener('generation:cancelled', handleCancelled as EventListener);

    return () => {
      coordinator.removeEventListener('generation:started', handleStart as EventListener);
      coordinator.removeEventListener('generation:completed', handleComplete as EventListener);
      coordinator.removeEventListener('generation:failed', handleError as EventListener);
      coordinator.removeEventListener('generation:cancelled', handleCancelled as EventListener);
    };
  }, [coordinator, deckId]);
  
  // Expose handleProgress to window for testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__handleSlideGeneration = handleProgress;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__handleSlideGeneration;
      }
    };
  }, [handleProgress]);

  // CRITICAL: Reset all refs when deckId changes to prevent stale data from previous deck
  useEffect(() => {
    // Clear all tracking refs when switching to a different deck
    processedSlidesRef.current.clear();
    slidesInProgressRef.current.clear();
    completedSlidesRef.current.clear();
    placeholdersCreatedRef.current = false;
    startedAtRef.current = null;
    lastMessageRef.current = { message: '', progress: -1, timestamp: 0 };
    resetThemeRelay();

    // Reset state
    setDeckStatus(null);
    setLastSystemMessage(null);

    // Check if new deck has an active generation (via coordinator or DB status)
    if (deckId && coordinator.isGenerating(deckId)) {
      setIsGenerating(true);
      setDeckStatus({
        state: 'creating',
        progress: 0,
        message: 'Initializing deck generation...',
        currentSlide: 0,
        totalSlides: 0,
        startedAt: new Date().toISOString()
      });
    } else if (deckId) {
      // Check if deck is mid-generation in Supabase (recovery after page reload)
      const storeData = useDeckStore.getState().deckData;
      const dbSt = storeData?.status;
      const stState = typeof dbSt === 'object' ? (dbSt as any)?.state
        : typeof dbSt === 'string' ? dbSt : null;
      if ((stState === 'generating' || stState === 'creating') && storeData?.uuid === deckId) {
        // Don't set isGenerating=false — the recovery effect will handle it
        setIsGenerating(true);
      } else {
        setIsGenerating(false);
      }
    } else {
      setIsGenerating(false);
    }
  }, [deckId, coordinator, resetThemeRelay]);

  // Listen to coordinator progress bus so events from other entry points (e.g., DeckList) are reflected
  useEffect(() => {
    const onProgressEvent = (e: Event) => {
      try {
        const ce = e as CustomEvent;
        const eventDeckId = ce.detail?.deckId;
        const evt = ce.detail?.event || ce.detail; // support both shapes
        // If this hook is bound to a specific deck, filter by deckId when available
        if (!deckId || !eventDeckId || eventDeckId === deckId) {
          handleProgress(evt);
        }
      } catch {}
    };
    coordinator.addEventListener('generation:progress', onProgressEvent as EventListener);
    return () => {
      coordinator.removeEventListener('generation:progress', onProgressEvent as EventListener);
    };
  }, [coordinator, deckId, handleProgress]);

  // Recovery polling: detect in-progress generation after page reload / navigation back.
  // When Modal is running, the container persists independently. The frontend needs to
  // detect that and poll the status endpoint until generation completes.
  const recoveryActiveRef = useRef(false);
  useEffect(() => {
    if (!deckId) return;
    // If the coordinator already tracks this generation (SSE still connected), skip recovery
    if (coordinator.isGenerating(deckId)) return;

    // Check deck data from the store to see if generation is in progress
    const deckData = useDeckStore.getState().deckData;
    const dbStatus = deckData?.status;
    const statusState = typeof dbStatus === 'object' ? (dbStatus as any)?.state
      : typeof dbStatus === 'string' ? dbStatus
      : null;

    if (statusState !== 'generating' && statusState !== 'creating') return;

    // Also verify this deck matches the one in the store
    if (deckData?.uuid && deckData.uuid !== deckId) return;

    console.log('[useSlideGeneration] Recovery: detected in-progress generation for', deckId);
    recoveryActiveRef.current = true;
    setIsGenerating(true);

    // Infer initial progress from existing slides
    const slides = deckData?.slides || [];
    const completedCount = slides.filter((s: any) => s.components && s.components.length > 0).length;
    const totalCount = slides.length || 0;
    const initialPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    startedAtRef.current = startedAtRef.current || new Date().toISOString();
    setDeckStatus({
      state: 'generating',
      progress: initialPct,
      message: completedCount > 0
        ? `Generating slides (${completedCount}/${totalCount})...`
        : 'Generation in progress...',
      currentSlide: completedCount,
      totalSlides: totalCount,
      startedAt: startedAtRef.current
    });

    // Post a system message so ChatPanel shows the progress
    postSystemMessage(
      completedCount > 0
        ? `Resuming — ${completedCount} of ${totalCount} slides generated...`
        : 'Generation in progress...',
      { type: 'generation_status', state: 'generating', progress: initialPct, isStreamingUpdate: true, stage: 'slide_generation' }
    );

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await new Promise(r => setTimeout(r, 3000));
        if (cancelled) break;

        try {
          const headers: Record<string, string> = {};
          const token = authService.getAuthToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(
            API_ENDPOINTS.getFullUrl(`/deck/${deckId}/status`),
            { headers }
          );
          if (!res.ok) continue;
          const status = await res.json();

          const pct = status.progress?.percentage ?? 0;
          const done = status.progress?.slides_completed ?? 0;
          const total = status.progress?.total_slides ?? 0;
          const isComplete = status.status === 'completed';

          setDeckStatus({
            state: isComplete ? 'completed' : 'generating',
            progress: isComplete ? 100 : pct,
            message: isComplete
              ? 'Your presentation is ready!'
              : `Generating slides (${done}/${total})...`,
            currentSlide: done,
            totalSlides: total,
            startedAt: startedAtRef.current || new Date().toISOString()
          });

          if (isComplete) {
            console.log('[useSlideGeneration] Recovery: generation completed for', deckId);
            setIsGenerating(false);
            recoveryActiveRef.current = false;

            // Reload deck data from backend to get all completed slides
            try {
              const { loadDeck } = useDeckStore.getState() as any;
              if (typeof loadDeck === 'function') {
                await loadDeck(deckId);
              }
            } catch (e) {
              console.warn('[useSlideGeneration] Recovery: failed to reload deck', e);
            }

            postSystemMessage('Your presentation is ready!', {
              type: 'generation_complete',
              stage: 'generation_complete',
              progress: 100,
              isStreamingUpdate: false,
              streamed: true,
              deckId
            });

            window.dispatchEvent(new CustomEvent('deck_generation_complete', {
              detail: { deckId, timestamp: Date.now() }
            }));
            break;
          }
        } catch (e) {
          console.warn('[useSlideGeneration] Recovery poll error:', e);
        }
      }
    };

    poll();
    return () => { cancelled = true; recoveryActiveRef.current = false; };
  }, [deckId, coordinator]);

  return {
    isGenerating,
    deckStatus,
    lastSystemMessage,
    startGeneration,
    stopGeneration,
    handleGenerationProgress: handleProgress
  };
} 
