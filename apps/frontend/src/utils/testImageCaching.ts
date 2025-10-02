/**
 * Test script to verify image caching is working properly
 * Run this in the browser console after deck generation
 */

export function testImageCaching() {
  console.group('🧪 Image Caching Test');
  
  // Check if debug utilities are loaded
  console.log('✓ Debug utilities loaded:', typeof (window as any).debugImageCache === 'function');
  
  // Check window caches
  const slideCache = (window as any).__slideImageCache || {};
  const topicCache = (window as any).__topicImageCache || {};
  
  console.log('📄 Slide cache entries:', Object.keys(slideCache).length);
  console.log('📂 Topic cache entries:', Object.keys(topicCache).length);
  
  // Check each slide in cache
  if (Object.keys(slideCache).length > 0) {
    console.group('Slide Details:');
    Object.entries(slideCache).forEach(([slideId, data]: [string, any]) => {
      console.log(`\n${slideId}:`);
      console.log('  - Title:', data.slideTitle);
      console.log('  - Images:', data.images?.length || 0);
      console.log('  - Topics:', data.topics || []);
      
      if (data.images && data.images.length > 0) {
        console.log('  - First image:', {
          url: data.images[0].url,
          topic: data.images[0].topic,
          source: data.images[0].source
        });
      }
    });
    console.groupEnd();
  } else {
    console.warn('❌ No slides in cache!');
  }
  
  // Check current deck
  const deckStore = (window as any).__deckStore?.getState?.();
  if (deckStore) {
    const slides = deckStore.deckData?.slides || [];
    console.log('\n📊 Current deck has', slides.length, 'slides');
    
    slides.forEach((slide: any, index: number) => {
      const hasImages = slide.components?.some((c: any) => c.type === 'Image' && c.props?.src && c.props.src !== 'placeholder');
      const cached = !!(slideCache[slide.id]);
      
      console.log(`Slide ${index} (${slide.id}):`);
      console.log('  - Has image components:', hasImages);
      console.log('  - Has cached images:', cached);
      console.log('  - Available images:', slide.availableImages?.length || 0);
    });
  }
  
  console.groupEnd();
  
  // Return summary
  return {
    slideCacheSize: Object.keys(slideCache).length,
    topicCacheSize: Object.keys(topicCache).length,
    totalImages: Object.values(slideCache).reduce((sum: number, data: any) => sum + (data.images?.length || 0), 0),
    hasCache: Object.keys(slideCache).length > 0
  };
}

// Auto-run after a delay if in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).testImageCaching = testImageCaching;
  
  // Also monitor for deck generation completion
  let checkInterval: any;
  const checkForCompletion = () => {
    const status = document.querySelector('[data-generation-status]')?.getAttribute('data-generation-status');
    if (status === 'completed') {
      clearInterval(checkInterval);
      setTimeout(() => {
        console.log('🔍 Running image cache test after deck generation...');
        testImageCaching();
      }, 2000);
    }
  };
  
  // Start checking when generation starts
  window.addEventListener('deck_generation_started', () => {
    checkInterval = setInterval(checkForCompletion, 1000);
  });
}

