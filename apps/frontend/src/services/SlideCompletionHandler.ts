/**
 * Service to handle slide completion events and ensure proper status updates
 * This ensures that when a slide is completed, all necessary updates are triggered
 */

import { useDeckStore } from '@/stores/deckStore';

export class SlideCompletionHandler {
  private static instance: SlideCompletionHandler;
  private initialized = false;

  static getInstance(): SlideCompletionHandler {
    if (!SlideCompletionHandler.instance) {
      SlideCompletionHandler.instance = new SlideCompletionHandler();
    }
    return SlideCompletionHandler.instance;
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('[SlideCompletionHandler] Initializing slide completion handler');

    // Listen for slide completion events
    window.addEventListener('slide_completed', this.handleSlideCompleted.bind(this));
    window.addEventListener('slide_generated', this.handleSlideCompleted.bind(this));

    // Also listen for the raw SSE events
    window.addEventListener('sse:slide_completed', this.handleSlideCompleted.bind(this));
    window.addEventListener('sse:slide_generated', this.handleSlideCompleted.bind(this));

    // Expose for testing
    (window as any).SlideCompletionHandler = SlideCompletionHandler;
    (window as any).useDeckStore = useDeckStore;
  }

  private async handleSlideCompleted(event: Event) {
    const customEvent = event as CustomEvent;
    const detail = customEvent.detail || {};

    console.warn('[SlideCompletionHandler] 🎯 Slide completion event received:', {
      type: event.type,
      slideIndex: detail.slide_index,
      slideId: detail.slide_id || detail.slideId,
      hasSlideData: !!detail.slide,
      components: detail.slide?.components?.length,
      timestamp: new Date().toISOString()
    });

    // Extract slide information
    const slideIndex = detail.slide_index ?? detail.slideIndex;
    const slideId = detail.slide_id || detail.slideId;
    const slideData = detail.slide;

    if (slideIndex === undefined && !slideId) {
      console.warn('[SlideCompletionHandler] No slide index or ID in event');
      return;
    }

    // Get current deck data
    const deckData = useDeckStore.getState().deckData;
    if (!deckData || !deckData.slides) {
      console.warn('[SlideCompletionHandler] No deck data available');
      return;
    }

    // Find the slide by index or ID
    let slide = null;
    let actualIndex = -1;

    if (slideIndex !== undefined && slideIndex >= 0 && slideIndex < deckData.slides.length) {
      slide = deckData.slides[slideIndex];
      actualIndex = slideIndex;
    } else if (slideId) {
      const foundIndex = deckData.slides.findIndex(s => s.id === slideId);
      if (foundIndex >= 0) {
        slide = deckData.slides[foundIndex];
        actualIndex = foundIndex;
      }
    }

    if (!slide) {
      console.warn('[SlideCompletionHandler] Could not find slide in deck data');
      return;
    }

    console.warn('[SlideCompletionHandler] Found slide:', {
      index: actualIndex,
      id: slide.id,
      currentStatus: slide.status,
      componentsCount: slide.components?.length
    });

    // Update the slide status to 'completed'
    if (slide.status !== 'completed') {
      console.warn(`[SlideCompletionHandler] Updating slide ${actualIndex + 1} status to completed`);

      // Check if user is currently viewing this slide
      const navContext = (window as any).__navigationContext;
      const isViewingThisSlide = navContext?.currentSlideIndex === actualIndex;

      // If user is viewing this slide and it has content, be extra careful
      if (isViewingThisSlide && slide.components && slide.components.length > 0) {
        console.log(`[SlideCompletionHandler] User is viewing slide ${actualIndex + 1}, using careful update`);
      }

      try {
        await useDeckStore.getState().updateSlide(slide.id, {
          status: 'completed',
          // Preserve existing components to prevent any loss
          components: slide.components
        });
        // Immediately harden status against regressions by re-applying deck-level merge
        try {
          const store = useDeckStore.getState();
          const data = store.deckData;
          const idx = data.slides.findIndex((s: any) => s.id === slide.id);
          if (idx >= 0) {
            const hardened = { ...data.slides[idx], status: 'completed' as const };
            const slides = [...data.slides];
            slides[idx] = hardened;
            store.updateDeckData({ slides }, { skipBackend: true });
          }
        } catch {}

        console.log(`[SlideCompletionHandler] Successfully updated slide ${actualIndex + 1} status`);
      } catch (error) {
        console.error('[SlideCompletionHandler] Error updating slide status:', error);
      }
    } else {
      console.log(`[SlideCompletionHandler] Slide ${actualIndex + 1} already has status 'completed'`);
    }
  }

  destroy() {
    window.removeEventListener('slide_completed', this.handleSlideCompleted.bind(this));
    window.removeEventListener('slide_generated', this.handleSlideCompleted.bind(this));
    window.removeEventListener('sse:slide_completed', this.handleSlideCompleted.bind(this));
    window.removeEventListener('sse:slide_generated', this.handleSlideCompleted.bind(this));
    this.initialized = false;
  }
}