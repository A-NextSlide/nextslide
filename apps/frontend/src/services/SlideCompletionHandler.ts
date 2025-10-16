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

    // Extract slide information
    const slideIndex = detail.slide_index ?? detail.slideIndex;
    const slideId = detail.slide_id || detail.slideId;
    const slideData = detail.slide;

    if (slideIndex === undefined && !slideId) {
      return;
    }

    // Get current deck data
    const deckData = useDeckStore.getState().deckData;
    if (!deckData || !deckData.slides) {
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
      return;
    }

    // Update the slide status to 'completed'
    if (slide.status !== 'completed') {
      // Check if user is currently viewing this slide
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
      } catch (error) {
        console.error('[SlideCompletionHandler] Error updating slide status:', error);
      }
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