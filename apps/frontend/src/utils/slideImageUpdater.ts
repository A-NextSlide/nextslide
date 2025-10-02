import { useDeckStore } from '@/stores/deckStore';
import { ComponentInstance } from '@/types/components';
import { SlideData } from '@/types/SlideTypes';

interface SlideImageData {
  slideId: string;
  slideIndex: number;
  images: Array<{
    url: string;
    description?: string;
    topic?: string;
    source?: string;
    width?: number;
    height?: number;
  }>;
  images_by_topic?: Record<string, any[]>;
  topics?: string[];
}

/**
 * Applies available images to Image components in a slide
 */
export class SlideImageUpdater {
  private static instance: SlideImageUpdater;
  private imageAssignmentMap = new Map<string, number>(); // Track which image index to use for each slide

  static getInstance(): SlideImageUpdater {
    if (!SlideImageUpdater.instance) {
      SlideImageUpdater.instance = new SlideImageUpdater();
    }
    return SlideImageUpdater.instance;
  }

  constructor() {
    // Listen for slide_images_available events
    if (typeof window !== 'undefined') {
      window.addEventListener('slide_images_available', this.handleImagesAvailable.bind(this));
    }
  }

  private handleImagesAvailable(event: CustomEvent) {
    const imageData = event.detail as SlideImageData;
    
    console.log('[SlideImageUpdater] handleImagesAvailable called with:', {
      hasDetail: !!event.detail,
      slideId: imageData?.slideId,
      slideIndex: imageData?.slideIndex,
      imageCount: imageData?.images?.length || 0
    });
    
    // More flexible validation - just need images and either slideId or slideIndex
    if (!imageData || !imageData.images || imageData.images.length === 0) {
      console.warn('[SlideImageUpdater] No valid image data in event');
      return;
    }
    
    if (!imageData.slideId && imageData.slideIndex === undefined) {
      console.warn('[SlideImageUpdater] No slideId or slideIndex in event');
      return;
    }

    // Apply images to the slide
    this.applyImagesToSlide(imageData);
  }

  private applyImagesToSlide(imageData: SlideImageData) {
    // Check if auto-select images is enabled
    const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages || false;
    
    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-select images is disabled, skipping automatic image application');
      return;
    }
    
    const { deckData } = useDeckStore.getState();
    
    console.log(`[SlideImageUpdater] === APPLYING IMAGES ===`);
    console.log(`[SlideImageUpdater] Image data:`, {
      slideId: imageData.slideId,
      slideIndex: imageData.slideIndex,
      imageCount: imageData.images?.length || 0,
      firstImageUrl: imageData.images?.[0]?.url
    });
    console.log(`[SlideImageUpdater] Current deck state:`, {
      totalSlides: deckData.slides.length,
      slideIds: deckData.slides.map(s => s.id),
      slideIndices: deckData.slides.map((s, i) => i)
    });
    
    // PRIORITIZE INDEX-BASED MATCHING
    // Backend sends slide_index which is more reliable than slide_id
    let slide: SlideData | undefined;
    
    if (imageData.slideIndex !== undefined && imageData.slideIndex < deckData.slides.length) {
      // Try by index first (more reliable for backend generation)
      slide = deckData.slides[imageData.slideIndex];
      if (slide) {
        console.log(`[SlideImageUpdater] ✓ Found slide by index ${imageData.slideIndex} (id: ${slide.id})`);
      }
    }
    
    // If not found by index, try by ID as fallback
    if (!slide && imageData.slideId) {
      slide = deckData.slides.find(s => s.id === imageData.slideId);
      if (slide) {
        console.log(`[SlideImageUpdater] ✓ Found slide by ID ${imageData.slideId}`);
      }
    }
    
    if (!slide) {
      console.error(`[SlideImageUpdater] ❌ SLIDE NOT FOUND`, {
        triedId: imageData.slideId,
        triedIndex: imageData.slideIndex,
        totalSlides: deckData.slides.length,
        availableSlideIds: deckData.slides.map(s => s.id)
      });
      return;
    }

    // Find Image components that need images
    const allImageComponents = slide.components.filter(c => c.type === 'Image');
    const imageComponents = slide.components.filter(c => 
      c.type === 'Image' && this.needsImage(c)
    );

    console.log(`[SlideImageUpdater] Component analysis for slide ${slide.id}:`, {
      totalComponents: slide.components.length,
      componentTypes: slide.components.map(c => c.type),
      totalImageComponents: allImageComponents.length,
      imageComponentsNeedingImages: imageComponents.length
    });
    
    if (allImageComponents.length > 0) {
      console.log(`[SlideImageUpdater] Image components detail:`, 
        allImageComponents.map(c => ({
          id: c.id,
          src: c.props.src,
          needsImage: this.needsImage(c)
        }))
      );
    }

    if (imageComponents.length === 0) {
      console.log('[SlideImageUpdater] ❌ No Image components need images');
      return;
    }

    console.log(`[SlideImageUpdater] ✓ Found ${imageComponents.length} Image components needing images`);

    // Update components with images
    const updatedComponents = slide.components.map(component => {
      if (component.type === 'Image' && this.needsImage(component)) {
        // Get the next image for this slide
        const imageIndex = this.getNextImageIndex(imageData.slideId, imageData.images.length);
        const selectedImage = this.selectBestImage(imageData, component, imageIndex);
        
        if (selectedImage) {
          console.log(`[SlideImageUpdater] Applying image to component ${component.id}:`, selectedImage.url);
          
          return {
            ...component,
            props: {
              ...component.props,
              src: selectedImage.url,
              alt: selectedImage.description || component.props.alt || 'Slide image',
              // Remove placeholder/generating states
              isGenerating: false,
              isPlaceholder: false
            }
          };
        }
      }
      return component;
    });

    // Log the update that will be made
    console.log(`[SlideImageUpdater] 🚀 Updating slide ${slide.id} with new components`);
    console.log(`[SlideImageUpdater] Components before:`, slide.components.filter(c => c.type === 'Image').map(c => ({
      id: c.id,
      src: c.props.src
    })));
    console.log(`[SlideImageUpdater] Components after:`, updatedComponents.filter(c => c.type === 'Image').map(c => ({
      id: c.id,
      src: c.props.src
    })));
    
    // Update the slide with new components
    const { batchUpdateSlideComponents } = useDeckStore.getState();
    batchUpdateSlideComponents([{
      slideId: slide.id,
      components: updatedComponents
    }]);

    console.log(`[SlideImageUpdater] ✅ COMPLETED: Updated slide ${slide.id} with images`);
  }

  private needsImage(component: ComponentInstance): boolean {
    const { src } = component.props;
    
    // Never overwrite if user explicitly selected/applied an image
    if ((component.props as any).userSetSrc) {
      return false;
    }

    // Determine if current src is a placeholder/generating value
    const isPlaceholderSrc = !src ||
      src === '' ||
      src === 'placeholder' ||
      src === '/placeholder.svg' ||
      src === '/placeholder.png' ||
      src.includes('/api/placeholder/') ||
      src.includes('via.placeholder.com') ||
      src.startsWith('https://placehold.co/') || // Common placeholder service
      src === 'generating://ai-image' ||
      // As a safety, treat generic 'placeholder' matches only when src is not a real URL
      (/placeholder/i.test(src) && !/^https?:\/\//.test(src));

    // Needs image only if src is placeholder-ish or component explicitly marked generating
    return isPlaceholderSrc || !!component.props.isGenerating;
  }

  private getNextImageIndex(slideId: string, totalImages: number): number {
    // Get current index for this slide, or start at 0
    const currentIndex = this.imageAssignmentMap.get(slideId) || 0;
    
    // Update to next index (with wraparound)
    const nextIndex = (currentIndex + 1) % totalImages;
    this.imageAssignmentMap.set(slideId, nextIndex);
    
    return currentIndex;
  }

  private selectBestImage(
    imageData: SlideImageData, 
    component: ComponentInstance,
    fallbackIndex: number
  ): any {
    const { images, images_by_topic, topics } = imageData;
    
    // 1. If component has a preferred topic
    if (component.props.topic && images_by_topic?.[component.props.topic]) {
      const topicImages = images_by_topic[component.props.topic];
      if (topicImages.length > 0) {
        return topicImages[fallbackIndex % topicImages.length];
      }
    }
    
    // 2. If component has keywords that match image descriptions
    if (component.props.keywords) {
      const keywords = component.props.keywords.toLowerCase().split(',').map((k: string) => k.trim());
      const matchedImage = images.find(img => 
        img.description && keywords.some(keyword => 
          img.description!.toLowerCase().includes(keyword)
        )
      );
      if (matchedImage) {
        return matchedImage;
      }
    }
    
    // 3. Try to match based on the slide's primary topic
    if (topics && topics.length > 0 && images_by_topic) {
      const primaryTopic = topics[0];
      if (images_by_topic[primaryTopic] && images_by_topic[primaryTopic].length > 0) {
        return images_by_topic[primaryTopic][fallbackIndex % images_by_topic[primaryTopic].length];
      }
    }
    
    // 4. Fall back to using images in order
    if (images.length > 0) {
      return images[fallbackIndex % images.length];
    }
    
    return null;
  }

  /**
   * Manually trigger image application for a specific slide
   */
  public async applyImagesFromCache(slideId: string) {
    // Check if auto-select images is enabled
    const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages || false;
    
    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-select images is disabled, skipping manual cache application');
      return;
    }
    
    // Check if images are already cached
    const cachedImages = (window as any).__slideImageCache?.[slideId];
    
    if (cachedImages && cachedImages.images && cachedImages.images.length > 0) {
      console.log(`[SlideImageUpdater] Applying cached images to slide ${slideId}`);
      this.applyImagesToSlide({
        slideId,
        slideIndex: cachedImages.slideIndex,
        images: cachedImages.images,
        images_by_topic: cachedImages.images_by_topic,
        topics: cachedImages.topics
      });
    }
  }

  /**
   * Apply images to all slides that have cached images
   */
  public applyAllCachedImages() {
    // Check if auto-select images is enabled
    const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages || false;
    
    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-select images is disabled, skipping automatic image application');
      return;
    }
    
    const imageCache = (window as any).__slideImageCache;
    
    console.log('[SlideImageUpdater] applyAllCachedImages called', {
      hasCacheObject: !!imageCache,
      cacheKeys: imageCache ? Object.keys(imageCache) : []
    });
    
    if (!imageCache) {
      console.log('[SlideImageUpdater] No image cache found');
      return;
    }

    const cacheEntries = Object.entries(imageCache);
    console.log(`[SlideImageUpdater] Found ${cacheEntries.length} cache entries`);

    // Track which slides have been processed to avoid duplicates
    const processedIndices = new Set<number>();

    // PRIORITIZE INDEX-BASED KEYS for backend generation
    // First, process all slide_index_ keys
    Object.entries(imageCache).forEach(([key, cachedData]: [string, any]) => {
      if (key.startsWith('slide_index_') && cachedData && cachedData.images && cachedData.images.length > 0) {
        const slideIndex = cachedData.slideIndex;
        if (slideIndex !== undefined && !processedIndices.has(slideIndex)) {
          console.log(`[SlideImageUpdater] Applying cached images for slide index ${slideIndex}`, {
            imageCount: cachedData.images.length
          });
          
          this.applyImagesToSlide({
            slideId: cachedData.slideId,
            slideIndex: slideIndex,
            images: cachedData.images,
            images_by_topic: cachedData.images_by_topic,
            topics: cachedData.topics
          });
          
          processedIndices.add(slideIndex);
        }
      }
    });

    // Then process any remaining non-index keys that haven't been processed
    Object.entries(imageCache).forEach(([key, cachedData]: [string, any]) => {
      if (!key.startsWith('slide_index_') && cachedData && cachedData.images && cachedData.images.length > 0) {
        const slideIndex = cachedData.slideIndex;
        if (slideIndex === undefined || !processedIndices.has(slideIndex)) {
          console.log(`[SlideImageUpdater] Applying cached images for key: ${key}`, {
            slideId: cachedData.slideId,
            slideIndex: cachedData.slideIndex,
            imageCount: cachedData.images.length
          });
          
          this.applyImagesToSlide({
            slideId: key,
            slideIndex: cachedData.slideIndex,
            images: cachedData.images,
            images_by_topic: cachedData.images_by_topic,
            topics: cachedData.topics
          });
          
          if (slideIndex !== undefined) {
            processedIndices.add(slideIndex);
          }
        }
      }
    });
  }
}

// Initialize the singleton
if (typeof window !== 'undefined') {
  SlideImageUpdater.getInstance();
  
  // Add debug helper
  (window as any).__applyImagesNow = () => {
    console.log('[DEBUG] Manually triggering image application...');
    const updater = SlideImageUpdater.getInstance();
    updater.applyAllCachedImages();
  };
  
  (window as any).__checkImageCache = () => {
    const cache = (window as any).__slideImageCache;
    if (!cache) {
      console.log('[DEBUG] No image cache found');
      return;
    }
    
    console.log('[DEBUG] Image cache contents:', {
      keys: Object.keys(cache),
      entries: Object.entries(cache).map(([key, value]: [string, any]) => ({
        key,
        slideId: value.slideId,
        slideIndex: value.slideIndex,
        imageCount: value.images?.length || 0,
        topics: value.topics
      }))
    });
  };
}