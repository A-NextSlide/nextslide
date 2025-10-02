/**
 * Debug utility for monitoring image cache
 * This helps visualize what images are available in the cache
 */

export function debugImageCache() {
  const slideCache = window.__slideImageCache || {};
  const topicCache = window.__topicImageCache || {};
  
  console.group('🖼️ Image Cache Debug');
  
  // Topic cache summary
  console.group('📂 Topic Cache');
  const topicEntries = Object.entries(topicCache);
  if (topicEntries.length === 0) {
    console.log('No topics cached yet');
  } else {
    topicEntries.forEach(([topic, images]) => {
      console.log(`${topic}: ${images.length} images`);
    });
  }
  console.groupEnd();
  
  // Slide cache summary
  console.group('📄 Slide Cache');
  const slideEntries = Object.entries(slideCache);
  if (slideEntries.length === 0) {
    console.log('No slides cached yet');
  } else {
    slideEntries.forEach(([slideId, data]) => {
      console.group(`Slide: ${data.slideTitle || slideId}`);
      console.log(`ID: ${slideId}`);
      console.log(`Index: ${data.slideIndex}`);
      console.log(`Total Images: ${data.images?.length || 0}`);
      console.log(`Topics: ${data.topics?.join(', ') || 'none'}`);
      
      if (data.images_by_topic) {
        console.group('Images by Topic:');
        Object.entries(data.images_by_topic).forEach(([topic, images]: [string, any]) => {
          console.log(`${topic}: ${images.length} images`);
        });
        console.groupEnd();
      }
      
      console.groupEnd();
    });
  }
  console.groupEnd();
  
  console.groupEnd();
  
  return { slideCache, topicCache };
}

// Expose globally for easy debugging
if (typeof window !== 'undefined') {
  (window as any).debugImageCache = debugImageCache;
  
  // Also add event listeners to log when images are cached
  window.addEventListener('slide_images_available', (event: any) => {
    console.log('📸 New images available:', event.detail);
  });
  
  // Log cache state periodically during development
  if (process.env.NODE_ENV === 'development') {
    let lastCacheSize = 0;
    setInterval(() => {
      const currentSize = Object.keys(window.__slideImageCache || {}).length;
      if (currentSize !== lastCacheSize) {
        console.log(`📊 Image cache size changed: ${lastCacheSize} → ${currentSize} slides`);
        lastCacheSize = currentSize;
      }
    }, 5000);
  }
}

// Helper to clear cache (useful for testing)
export function clearImageCache() {
  if (typeof window !== 'undefined') {
    window.__slideImageCache = {};
    window.__topicImageCache = {};
    console.log('🗑️ Image cache cleared');
  }
}

// Helper to check if a slide has cached images
export function hasSlideImages(slideId: string): boolean {
  return !!(window.__slideImageCache?.[slideId]?.images?.length);
}

// Helper to get image count for a slide
export function getSlideImageCount(slideId: string): number {
  return window.__slideImageCache?.[slideId]?.images?.length || 0;
}

// Export for use in components
export default {
  debug: debugImageCache,
  clear: clearImageCache,
  hasImages: hasSlideImages,
  getCount: getSlideImageCount
};

