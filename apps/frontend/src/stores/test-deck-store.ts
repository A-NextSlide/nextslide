/**
 * This file demonstrates how to use the refactored deck store.
 * It's intended to be used as a reference but not included in the actual build.
 */

import { useDeckStore, useDeckSlides, useCurrentSlide, useDeckSyncState } from './deckStore';

// Initialize the store
const initializeDeckStore = () => {
  // Initialize with default options
  useDeckStore.getState().initialize();
  
  // Or initialize with specific options
  useDeckStore.getState().initialize({
    syncEnabled: true,
    useRealtimeSubscription: true,
    deckId: 'some-deck-id'
  });
};

// Working with slides
const addNewSlide = async () => {
  await useDeckStore.getState().addSlide({
    title: 'New Slide',
    components: []
  });
};

const updateExistingSlide = async (slideId: string) => {
  await useDeckStore.getState().updateSlide(slideId, {
    title: 'Updated Slide Title'
  });
};

// Working with versions
const createNewVersion = async () => {
  const versionId = await useDeckStore.getState().createVersion(
    'Version 1.0',
    'Initial release version',
    true // bookmarked
  );
  
  console.log(`Created version with ID: ${versionId}`);
};

// Using selectors
const useSlideSelectors = () => {
  // In a React component:
  const allSlides = useDeckSlides();
  const currentSlide = useCurrentSlide(0); // first slide
  const { isSyncing, lastSyncTime } = useDeckSyncState();
};

// Example of a full workflow
const fullExample = async () => {
  // Initialize
  const cleanup = useDeckStore.getState().initialize();
  
  // Add a slide
  await useDeckStore.getState().addSlide({
    title: 'Title Slide',
    components: []
  });
  
  // Add another slide after the first one
  const slides = useDeckStore.getState().deckData.slides;
  if (slides.length > 0) {
    await useDeckStore.getState().addSlideAfter(slides[0].id, {
      title: 'Content Slide'
    });
  }
  
  // Create a version
  await useDeckStore.getState().createVersion('First Draft');
  
  // Cleanup when done
  cleanup();
};