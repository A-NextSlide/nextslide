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
  private appliedImages = new Map<string, string>(); // Track component -> image URL to prevent swapping
  private searchCache = new Map<string, any>(); // Cache search results to avoid duplicate API calls
  private processingSlides = new Set<string>(); // Track which slides are currently being processed
  private isPreloading = false; // Flag to prevent concurrent preloading

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

    // Apply images to the slide (now async)
    this.applyImagesToSlide(imageData).catch(err => {
      console.error('[SlideImageUpdater] Error applying images:', err);
    });
  }

  /**
   * Search for an image using the same API that SearchTab uses
   * Fetches first 10 results and picks one randomly for variety
   * Results are cached to avoid duplicate API calls
   */
  private async searchForImage(query: string): Promise<any | null> {
    // Check cache first
    if (this.searchCache.has(query)) {
      const cached = this.searchCache.get(query);
      console.log(`[SlideImageUpdater] Using cached result for "${query}"`);
      return cached;
    }

    try {
      const response = await fetch('/api/media/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          type: 'images',
          limit: 10, // Fetch first 10 results
          page: 1
        })
      });

      if (!response.ok) {
        console.warn(`[SlideImageUpdater] Search failed for "${query}":`, response.statusText);
        return null;
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        // Pick a random result from the first 10 for variety
        const randomIndex = Math.floor(Math.random() * data.results.length);
        const selected = data.results[randomIndex];

        // Cache the result
        this.searchCache.set(query, selected);

        return selected;
      }

      return null;
    } catch (error) {
      console.error('[SlideImageUpdater] Search error:', error);
      return null;
    }
  }

  private async applyImagesToSlide(imageData: SlideImageData) {
    // Check if auto-select images is enabled
    const preferences = (window as any).__slideGenerationPreferences;
    // Only apply if EXPLICITLY set to TRUE
    const autoSelectImages = preferences?.autoSelectImages === true;

    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-select images is disabled, skipping application');
      return;
    }
    
    const { deckData } = useDeckStore.getState();
    
    // PRIORITIZE INDEX-BASED MATCHING
    // Backend sends slide_index which is more reliable than slide_id
    let slide: SlideData | undefined;
    
    if (imageData.slideIndex !== undefined && imageData.slideIndex < deckData.slides.length) {
      // Try by index first (more reliable for backend generation)
      slide = deckData.slides[imageData.slideIndex];
    }
    
    // If not found by index, try by ID as fallback
    if (!slide && imageData.slideId) {
      slide = deckData.slides.find(s => s.id === imageData.slideId);
    }
    
    if (!slide) {
      return;
    }

    // Check if this slide is already being processed
    if (this.processingSlides.has(slide.id)) {
      console.log(`[SlideImageUpdater] ⏭️ Slide ${slide.id} already being processed, skipping...`);
      return;
    }

    // Mark as processing
    this.processingSlides.add(slide.id);
    console.log(`[SlideImageUpdater] 🎨 Processing slide ${slide.id}...`);

    // Find Image components that need images
    // Check appliedImages map first to avoid processing already-applied components
    const imageComponents = slide.components.filter(c => {
      if (c.type !== 'Image') return false;

      const componentKey = `${slide.id}-${c.id}`;

      // Skip if already applied (check map first)
      if (this.appliedImages.has(componentKey)) {
        console.log(`[SlideImageUpdater] ⏭️ Skipping ${componentKey} - already in appliedImages map`);
        return false;
      }

      return this.needsImage(c);
    });

    if (imageComponents.length === 0) {
      console.log(`[SlideImageUpdater] ℹ️ No images needed for slide ${slide.id}`);
      this.processingSlides.delete(slide.id);
      return;
    }

    console.log(`[SlideImageUpdater] 🖼️ Found ${imageComponents.length} components needing images in slide ${slide.id}`);

    // Update components with images using FRESH SEARCH (same as SearchTab)
    const usedUrls = new Set<string>();

    const updatedComponents = await Promise.all(
      slide.components.map(async (component) => {
        if (component.type === 'Image' && this.needsImage(component)) {
          const componentKey = `${slide.id}-${component.id}`;

          // Check if we've already applied an image to this component
          if (this.appliedImages.has(componentKey)) {
            const appliedUrl = this.appliedImages.get(componentKey);
            console.log(`[SlideImageUpdater] 🔒 Already applied to ${componentKey}, keeping: ${appliedUrl?.substring(0, 50)}...`);
            return {
              ...component,
              props: {
                ...component.props,
                src: appliedUrl,
                autoApplied: true,
                isGenerating: false,
                isPlaceholder: false
              }
            };
          }

          // Get search query from component metadata (same priority as ImagePicker)
          const searchQuery = component.props.metadata?.searchQuery || component.props.metadata?.topic;

          if (searchQuery) {
            console.log(`[SlideImageUpdater] 🔍 Searching for "${searchQuery}" for component ${component.id}...`);

            // Do a fresh search using the same API as SearchTab
            const searchResult = await this.searchForImage(searchQuery);

            if (searchResult && !usedUrls.has(searchResult.link)) {
              usedUrls.add(searchResult.link);

              // Mark this image as applied IMMEDIATELY to prevent future swaps
              this.appliedImages.set(componentKey, searchResult.link);

              console.log(`[SlideImageUpdater] ✅ Applied "${searchQuery}" → ${searchResult.link.substring(0, 50)}... to ${componentKey}`);

              return {
                ...component,
                props: {
                  ...component.props,
                  src: searchResult.link,
                  alt: searchResult.title || searchResult.alt || component.props.alt || 'Slide image',
                  autoApplied: true, // Mark as auto-applied
                  // Remove placeholder/generating states
                  isGenerating: false,
                  isPlaceholder: false
                }
              };
            } else {
              console.log(`[SlideImageUpdater] ⚠️ No result for "${searchQuery}" or URL already used`);
            }
          }
        }
        return component;
      })
    );
    
    // Update the slide with new components
    const { batchUpdateSlideComponents } = useDeckStore.getState();
    batchUpdateSlideComponents([{
      slideId: slide.id,
      components: updatedComponents
    }]);

    // Remove from processing set
    this.processingSlides.delete(slide.id);

    console.log(`[SlideImageUpdater] ✅ COMPLETED: Updated slide ${slide.id} with fresh search results`);
  }

  private needsImage(component: ComponentInstance): boolean {
    const { src } = component.props;
    
    // Never overwrite if user explicitly selected/applied an image
    if ((component.props as any).userSetSrc) {
      return false;
    }

    // Never overwrite if we've already auto-applied an image
    if ((component.props as any).autoApplied) {
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

  /**
   * Preload images for all slides by searching in parallel
   * This should be called during slide generation to have images ready on load
   */
  public async preloadImagesForSlides(slides: SlideData[]) {
    if (this.isPreloading) {
      console.log('[SlideImageUpdater] Already preloading, skipping...');
      return;
    }

    this.isPreloading = true;
    console.log('[SlideImageUpdater] 🔍 Starting preload for', slides.length, 'slides...');

    const searchPromises: Promise<void>[] = [];
    const queriesFound = new Set<string>();

    for (const slide of slides) {
      const imageComponents = slide.components.filter(c => c.type === 'Image');

      for (const component of imageComponents) {
        const searchQuery = component.props.metadata?.searchQuery || component.props.metadata?.topic;

        if (searchQuery && !this.searchCache.has(searchQuery) && !queriesFound.has(searchQuery)) {
          queriesFound.add(searchQuery);
          console.log(`[SlideImageUpdater] 🔍 Queueing search for: "${searchQuery}"`);

          // Start search in parallel (don't await here)
          const searchPromise = this.searchForImage(searchQuery).then(result => {
            if (result) {
              console.log(`[SlideImageUpdater] ✅ Preloaded image for "${searchQuery}": ${result.link}`);
            }
          }).catch(err => {
            console.error(`[SlideImageUpdater] ❌ Failed to preload image for "${searchQuery}":`, err);
          });

          searchPromises.push(searchPromise);
        }
      }
    }

    // Wait for all searches to complete
    await Promise.all(searchPromises);
    this.isPreloading = false;
    console.log(`[SlideImageUpdater] ✅ Preload complete! Loaded ${searchPromises.length} unique images`);
  }

  /**
   * Apply images to a newly created slide immediately during generation
   * This avoids the delay of waiting for slide_images_available event
   */
  public async applyImagesToNewSlide(slideId: string, slideIndex: number) {
    // Check if auto-select images is enabled
    const preferences = (window as any).__slideGenerationPreferences;
    const autoSelectImages = preferences?.autoSelectImages === true;

    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-apply disabled, skipping immediate application');
      return;
    }

    const { deckData, batchUpdateSlideComponents } = useDeckStore.getState();
    const slide = deckData.slides[slideIndex];

    if (!slide) {
      console.log(`[SlideImageUpdater] Slide not found at index ${slideIndex}`);
      return;
    }

    // Check if already processing
    if (this.processingSlides.has(slide.id)) {
      console.log(`[SlideImageUpdater] ⏭️ Slide ${slide.id} already being processed`);
      return;
    }

    this.processingSlides.add(slide.id);
    console.log(`[SlideImageUpdater] 🎨 Immediately applying images to new slide ${slide.id}...`);

    // Find Image components with searchQuery metadata
    const imageComponents = slide.components.filter(c => {
      if (c.type !== 'Image') return false;
      const componentKey = `${slide.id}-${c.id}`;

      // Skip if already applied
      if (this.appliedImages.has(componentKey)) {
        return false;
      }

      // Must have searchQuery metadata
      const searchQuery = c.props.metadata?.searchQuery || c.props.metadata?.topic;
      return !!searchQuery && this.needsImage(c);
    });

    if (imageComponents.length === 0) {
      console.log(`[SlideImageUpdater] ℹ️ No images to apply for slide ${slide.id}`);
      this.processingSlides.delete(slide.id);
      return;
    }

    console.log(`[SlideImageUpdater] 🖼️ Applying ${imageComponents.length} images to slide ${slide.id}`);

    const usedUrls = new Set<string>();
    const updatedComponents = await Promise.all(
      slide.components.map(async (component) => {
        if (component.type === 'Image' && this.needsImage(component)) {
          const componentKey = `${slide.id}-${component.id}`;

          // Skip if already applied
          if (this.appliedImages.has(componentKey)) {
            return component;
          }

          const searchQuery = component.props.metadata?.searchQuery || component.props.metadata?.topic;

          if (searchQuery) {
            console.log(`[SlideImageUpdater] 🔍 Searching for "${searchQuery}" for component ${component.id}...`);

            const searchResult = await this.searchForImage(searchQuery);

            if (searchResult && !usedUrls.has(searchResult.link)) {
              usedUrls.add(searchResult.link);
              this.appliedImages.set(componentKey, searchResult.link);

              console.log(`[SlideImageUpdater] ✅ Applied "${searchQuery}" → ${searchResult.link.substring(0, 50)}...`);

              return {
                ...component,
                props: {
                  ...component.props,
                  src: searchResult.link,
                  alt: searchResult.title || searchResult.alt || component.props.alt || 'Slide image',
                  autoApplied: true,
                  isGenerating: false,
                  isPlaceholder: false
                }
              };
            }
          }
        }
        return component;
      })
    );

    // Update the slide with images
    batchUpdateSlideComponents([{
      slideId: slide.id,
      components: updatedComponents
    }]);

    this.processingSlides.delete(slide.id);
    console.log(`[SlideImageUpdater] ✅ Completed immediate image application for slide ${slide.id}`);
  }

  /**
   * Manually trigger image application for a specific slide
   * Note: This now performs fresh searches instead of using cached images
   */
  public async applyImagesFromCache(slideId: string) {
    // Check if auto-select images is enabled (default to TRUE)
    const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages !== false;

    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-select images is explicitly disabled, skipping manual cache application');
      return;
    }
    
    // Check if images are already cached
    const cachedImages = (window as any).__slideImageCache?.[slideId];
    
    if (cachedImages && cachedImages.images && cachedImages.images.length > 0) {
      console.log(`[SlideImageUpdater] Applying fresh search results to slide ${slideId}`);
      await this.applyImagesToSlide({
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
   * Note: This now performs fresh searches instead of using cached images
   */
  public async applyAllCachedImages() {
    // Check if auto-select images is enabled (default to TRUE)
    const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages !== false;

    if (!autoSelectImages) {
      console.log('[SlideImageUpdater] Auto-select images is explicitly disabled, skipping automatic image application');
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
    for (const [key, cachedData] of Object.entries(imageCache) as [string, any][]) {
      if (key.startsWith('slide_index_') && cachedData && cachedData.images && cachedData.images.length > 0) {
        const slideIndex = cachedData.slideIndex;
        if (slideIndex !== undefined && !processedIndices.has(slideIndex)) {
          console.log(`[SlideImageUpdater] Applying fresh search results for slide index ${slideIndex}`);
          
          await this.applyImagesToSlide({
            slideId: cachedData.slideId,
            slideIndex: slideIndex,
            images: cachedData.images,
            images_by_topic: cachedData.images_by_topic,
            topics: cachedData.topics
          });
          
          processedIndices.add(slideIndex);
        }
      }
    }

    // Then process any remaining non-index keys that haven't been processed
    for (const [key, cachedData] of Object.entries(imageCache) as [string, any][]) {
      if (!key.startsWith('slide_index_') && cachedData && cachedData.images && cachedData.images.length > 0) {
        const slideIndex = cachedData.slideIndex;
        if (slideIndex === undefined || !processedIndices.has(slideIndex)) {
          console.log(`[SlideImageUpdater] Applying fresh search results for key: ${key}`);
          
          await this.applyImagesToSlide({
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
    }
  }
}

// Initialize the singleton
if (typeof window !== 'undefined') {
  SlideImageUpdater.getInstance();
  
  // Add debug helpers
  (window as any).__applyImagesNow = async () => {
    console.log('[DEBUG] Manually triggering image application with fresh searches...');
    const updater = SlideImageUpdater.getInstance();
    await updater.applyAllCachedImages();
    console.log('[DEBUG] Image application complete!');
  };

  (window as any).__clearImageCache = () => {
    console.log('[DEBUG] Clearing image search cache...');
    const updater = SlideImageUpdater.getInstance();
    (updater as any).searchCache.clear();
    (updater as any).appliedImages.clear();
    console.log('[DEBUG] Cache cleared!');
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