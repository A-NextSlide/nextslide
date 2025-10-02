import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { processImageUrls, processImageArray } from '@/utils/imageUtils';

// Extend Window interface to include our global image caches
declare global {
  interface Window {
    __slideImageCache?: Record<string, {
      slideId: string;
      slideIndex: number;
      slideTitle: string;
      images: any[];
      topics?: string[];
      images_by_topic?: Record<string, any[]>;
    }>;
    __topicImageCache?: Record<string, any[]>;
  }
}

interface ImageOption {
  id: string;
  url: string;
  thumbnail: string;
  alt: string;
  photographer?: string;
  width?: number;
  height?: number;
  src?: {
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    original?: string;
  };
}

interface ImageOptionsResponse {
  topics: Record<string, ImageOption[]>;
  slides: Record<string, {
    title: string;
    index: number;
    type: string;
    topics: string[];
    placeholders: number;
    available_images: ImageOption[];
    image_count: number;
  }>;
  metadata: {
    total_topics_searched: number;
    successful_searches: number;
    failed_searches: number;
    total_images_found: number;
    ai_images_generated: number;
    error?: string;
  };
  deck_info: {
    deck_id: string;
    deck_title: string;
    total_slides: number;
  };
}

export const useImageOptions = (deckId: string, deckUuid: string) => {
  const [imageOptions, setImageOptions] = useState<ImageOptionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Record<string, string[]>>({});
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null);
  const { toast } = useToast();

  // Check if a slide has image placeholders
  const hasImagePlaceholders = useCallback((slide: SlideData): boolean => {
    if (!slide.components) return false;
    
    return slide.components.some(component => {
      if (component.type !== 'Image') return false;
      const src = component.props.src;
      return !src || 
             src === 'placeholder' || 
             src === '/placeholder.svg' || 
             src === '/placeholder.png' ||
             src.includes('/api/placeholder/');
    });
  }, []);

  // Get image placeholders from a slide
  const getImagePlaceholders = useCallback((slide: SlideData): ComponentInstance[] => {
    if (!slide.components) return [];
    
    return slide.components.filter(component => {
      if (component.type !== 'Image') return false;
      const src = component.props.src;
      return !src || 
             src === 'placeholder' || 
             src === '/placeholder.svg' || 
             src === '/placeholder.png' ||
             src.includes('/api/placeholder/');
    });
  }, []);

  // Fetch image options from the API
  const fetchImageOptions = useCallback(async (deckOutline: any) => {
    // Validate input
    if (!deckOutline || !deckOutline.slides || deckOutline.slides.length === 0) {
      return null;
    }
    
    // Check if we already have cached images for this deck
    const cacheKeys = deckOutline.slides.map((slide: any) => 
      `${slide.id}-${slide.title}-${slide.index}`
    );

    if (window.__slideImageCache && Object.keys(window.__slideImageCache).length > 0) {
      
      // Build ImageOptionsResponse from cache
      const cachedResponse: ImageOptionsResponse = {
        slides: {},
        topics: {},
        metadata: {
          total_topics_searched: 0,
          successful_searches: 0,
          failed_searches: 0,
          total_images_found: 0,
          ai_images_generated: 0
        },
        deck_info: {
          deck_id: deckId,
          deck_title: deckOutline.title || 'Untitled Deck',
          total_slides: 0
        }
      };
      
      // Process each cached slide
      Object.entries(window.__slideImageCache).forEach(([slideId, cacheData]) => {
        const allImages = cacheData.images || [];
        
        // Add slide info
        cachedResponse.slides[slideId] = {
          index: cacheData.slideIndex,
          title: cacheData.slideTitle,
          type: 'content', // Default type
          topics: cacheData.topics || [],
          placeholders: 1, // Default to 1, will be calculated from actual placeholders
          available_images: allImages,
          image_count: allImages.length
        };
        
        // Add images by topic
        if (cacheData.images_by_topic) {
          Object.entries(cacheData.images_by_topic).forEach(([topic, images]: [string, any]) => {
            if (!cachedResponse.topics[topic]) {
              cachedResponse.topics[topic] = [];
            }
            cachedResponse.topics[topic] = images;
          });
        } else if (allImages.length > 0) {
          // If no images_by_topic, group by image topics
          allImages.forEach((img: any) => {
            const topic = img.topic || 'general';
            if (!cachedResponse.topics[topic]) {
              cachedResponse.topics[topic] = [];
            }
            cachedResponse.topics[topic].push(img);
          });
        }
        
        // Update metadata
        cachedResponse.deck_info.total_slides++;
        cachedResponse.metadata.total_images_found += allImages.length;
      });
      
      cachedResponse.metadata.total_topics_searched = Object.keys(cachedResponse.topics).length;
      cachedResponse.metadata.successful_searches = cachedResponse.metadata.total_topics_searched;
      
      setImageOptions(cachedResponse);
      
      // Show notification
      if (cachedResponse.metadata.total_images_found > 0) {
        toast({
          title: "Images Ready for Selection",
          description: `Found ${cachedResponse.metadata.total_images_found} images across ${cachedResponse.metadata.total_topics_searched} topics`,
          duration: 5000,
        });
      }
      
      setIsLoading(false);
      return cachedResponse;
    }
    
    // Original API call logic
    setIsLoading(true);
    try {
      const requestBody = {
        deck_id: deckId,
        deck_outline: deckOutline,
        images_per_topic: 20,
        max_topics_per_slide: 5
      };
      
      const response = await fetch('/api/image-options/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error('Failed to fetch image options');
      }

      const data: ImageOptionsResponse = await response.json();
      setImageOptions(data);

      // Show notification about available images
      if (data.metadata.total_images_found > 0) {
        toast({
          title: "Images Ready for Selection",
          description: `Found ${data.metadata.total_images_found} images across ${data.metadata.total_topics_searched} topics`,
          duration: 5000,
        });
      }

      return data;
    } catch (error) {
      console.error('❌ Error fetching image options:', error);
      toast({
        title: "Error",
        description: "Failed to fetch image options. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [deckId, toast]);

  // Apply selected images to the deck
  const applySelectedImages = useCallback(async () => {
    if (!selectedImages || Object.keys(selectedImages).length === 0) {
      toast({
        title: "No Images Selected",
        description: "Please select images before applying.",
        variant: "destructive",
      });
      return false;
    }

    try {
      const response = await fetch('/api/image-options/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck_uuid: deckUuid,
          image_selections: selectedImages
        })
      });

      if (!response.ok) {
        throw new Error('Failed to apply images');
      }

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Images Applied",
          description: `Successfully updated ${result.slides_updated} slides`,
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error applying images:', error);
      toast({
        title: "Error",
        description: "Failed to apply images. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  }, [selectedImages, deckUuid, toast]);

  // Search for additional images for a topic
  const searchAdditionalImages = useCallback(async (topic: string) => {
    try {
      const response = await fetch('/api/image-options/search-additional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          num_images: 20,
          deck_id: deckId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to search additional images');
      }

      const newImages: ImageOption[] = await response.json();
      
      // Update the image options with new images
      if (imageOptions) {
        setImageOptions({
          ...imageOptions,
          topics: {
            ...imageOptions.topics,
            [topic]: [...(imageOptions.topics[topic] || []), ...newImages]
          },
          metadata: {
            ...imageOptions.metadata,
            total_images_found: imageOptions.metadata.total_images_found + newImages.length
          }
        });
      }

      return newImages;
    } catch (error) {
      console.error('Error searching additional images:', error);
      toast({
        title: "Error",
        description: "Failed to search for more images. Please try again.",
        variant: "destructive",
      });
      return [];
    }
  }, [deckId, imageOptions, toast]);

  // Select an image for a slide
  const selectImage = useCallback((slideId: string, imageUrl: string) => {
    setSelectedImages(prev => {
      const slideImages = prev[slideId] || [];
      
      // Check if image is already selected
      if (slideImages.includes(imageUrl)) {
        // Remove the image
        return {
          ...prev,
          [slideId]: slideImages.filter(url => url !== imageUrl)
        };
      }
      
      // Add the image (limit to placeholder count if known)
      const slide = imageOptions?.slides[slideId];
      const maxImages = slide?.placeholders || 10; // Default max
      
      if (slideImages.length >= maxImages) {
        toast({
          title: "Maximum Images Selected",
          description: `This slide can only have ${maxImages} images.`,
          variant: "destructive",
        });
        return prev;
      }
      
      return {
        ...prev,
        [slideId]: [...slideImages, imageUrl]
      };
    });
  }, [imageOptions, toast]);

  // Open the image picker for a specific slide
  const openImagePicker = useCallback((slideId: string) => {
    setCurrentSlideId(slideId);
    setIsPickerOpen(true);
  }, []);

  // Close the image picker
  const closeImagePicker = useCallback(() => {
    setIsPickerOpen(false);
    setCurrentSlideId(null);
  }, []);

  // Get images for the current slide
  const getCurrentSlideImages = useCallback((slideId?: string) => {
    const targetSlideId = slideId || currentSlideId;
    if (!targetSlideId) return [];
    
    // First check if we have images from the API
    if (imageOptions) {
      const slideInfo = imageOptions.slides[targetSlideId];
      if (slideInfo) {
        // Combine images from all relevant topics
        const allImages: ImageOption[] = [];
        const seenUrls = new Set<string>();
        
        slideInfo.topics.forEach(topic => {
          const topicImages = imageOptions.topics[topic] || [];
          topicImages.forEach(img => {
            if (!seenUrls.has(img.url)) {
              seenUrls.add(img.url);
                              allImages.push(processImageUrls(img));
            }
          });
        });
        
        if (allImages.length > 0) {
          return allImages;
        }
      }
    }
    
    // Check the global slide cache for images_by_topic structure
    if (window.__slideImageCache) {
      // Try direct lookup first
      let cachedData = window.__slideImageCache[targetSlideId];
      
      // If not found, try to find by slide index (for slides that haven't been saved yet)
      if (!cachedData) {
        // Extract slide index from ID like "slide-1-photosynthesis-intro"
        const slideIndexMatch = targetSlideId.match(/^slide-(\d+)/);
        if (slideIndexMatch) {
          const slideIndex = parseInt(slideIndexMatch[1]) - 1; // Convert to 0-based index
          cachedData = window.__slideImageCache[`slide_index_${slideIndex}`];
        }
        
        // Also check all cached entries to find matching slide
        if (!cachedData) {
          Object.values(window.__slideImageCache).forEach((cache: any) => {
            if (cache.slideTitle && targetSlideId.includes(cache.slideTitle.toLowerCase().replace(/\s+/g, '-'))) {
              cachedData = cache;
            }
          });
        }
      }
      
      if (cachedData) {
        // If we have images_by_topic, use that structure
        if (cachedData.images_by_topic && Object.keys(cachedData.images_by_topic).length > 0) {
          const allImages: ImageOption[] = [];
          const seenUrls = new Set<string>();
          
          Object.entries(cachedData.images_by_topic).forEach(([topic, images]) => {
            (images as any[]).forEach((img: any) => {
              if (!seenUrls.has(img.url)) {
                seenUrls.add(img.url);
                // Ensure we have the correct structure for ImageOption
                const imageOption: ImageOption = {
                  id: img.id || img.url,
                  url: img.url,
                  thumbnail: img.thumbnail || img.url,
                  alt: img.alt || img.description || topic,
                  photographer: img.photographer,
                  width: img.width,
                  height: img.height,
                  src: img.src || {
                    thumbnail: img.thumbnail,
                    small: img.url,
                    medium: img.url,
                    large: img.url,
                    original: img.url
                  },
                  // Store extra data in the object
                  ...img,
                  topic
                };
                allImages.push(imageOption);
              }
            });
          });
          
          return allImages;
        }
        
        // Fallback to flat images array
        if (cachedData.images && cachedData.images.length > 0) {
          return cachedData.images;
        }
      }
    }
    
    // Check the global topic cache
    if (window.__topicImageCache) {
      const allTopicImages: ImageOption[] = [];
      const seenUrls = new Set<string>();
      
      // Get all available topics
      const availableTopics = Object.keys(window.__topicImageCache);
      
      // Organize images by topic for the UI
      const imagesByTopic: Record<string, ImageOption[]> = {};
      
      availableTopics.forEach(topic => {
        const topicImages = window.__topicImageCache![topic] || [];
        imagesByTopic[topic] = [];
        
        topicImages.forEach((img: any) => {
          if (!seenUrls.has(img.url)) {
            seenUrls.add(img.url);
            // Add topic info to the image
            const imageWithTopic = { ...img, topic };
            allTopicImages.push(imageWithTopic);
            imagesByTopic[topic].push(imageWithTopic);
          }
        });
      });
      
      if (allTopicImages.length > 0) {
        // Return all images with topic information
        return allTopicImages;
      }
    }
    
    // FALLBACK: If this slide has no images, try to find images from any cached slide
    const allCachedSlides = Object.keys(window.__slideImageCache || {});
    
    console.log('[getCurrentSlideImages] Fallback - checking all cached slides:', {
      targetSlideId,
      cachedSlideIds: allCachedSlides,
      cacheContents: allCachedSlides.map(id => ({
        slideId: id,
        hasImages: window.__slideImageCache![id]?.images?.length || 0,
        hasImagesByTopic: !!window.__slideImageCache![id]?.images_by_topic,
        topics: window.__slideImageCache![id]?.topics || []
      }))
    });
    
    // Collect all unique images from all cached slides
    const allImages: ImageOption[] = [];
    const seenUrls = new Set<string>();
    
    for (const slideId of allCachedSlides) {
      const slideData = window.__slideImageCache![slideId];
      
      // Try images_by_topic first
      if (slideData?.images_by_topic && Object.keys(slideData.images_by_topic).length > 0) {
        Object.entries(slideData.images_by_topic).forEach(([topic, images]) => {
          (images as any[]).forEach((img: any) => {
            if (!seenUrls.has(img.url)) {
              seenUrls.add(img.url);
              const imageOption: ImageOption = {
                id: img.id || img.url,
                url: img.url,
                thumbnail: img.thumbnail || img.url,
                alt: img.alt || img.description || topic,
                photographer: img.photographer,
                width: img.width,
                height: img.height,
                src: img.src || {
                  thumbnail: img.thumbnail,
                  small: img.url,
                  medium: img.url,
                  large: img.url,
                  original: img.url
                },
                topic,
                ...img
              };
              allImages.push(imageOption);
            }
          });
        });
      }
      
      // Also check flat images array
      if (slideData?.images && slideData.images.length > 0) {
        slideData.images.forEach((img: any) => {
          if (!seenUrls.has(img.url)) {
            seenUrls.add(img.url);
            allImages.push(img);
          }
        });
      }
    }
    
    if (allImages.length > 0) {
      console.log('[getCurrentSlideImages] Found images in fallback:', {
        totalImages: allImages.length,
        fromSlides: allCachedSlides
      });
      return allImages;
    }
    
    console.log('[getCurrentSlideImages] No images found anywhere');
    return [];
  }, [currentSlideId, imageOptions]);

  return {
    imageOptions,
    isLoading,
    selectedImages,
    isPickerOpen,
    currentSlideId,
    hasImagePlaceholders,
    getImagePlaceholders,
    fetchImageOptions,
    applySelectedImages,
    searchAdditionalImages,
    selectImage,
    openImagePicker,
    closeImagePicker,
    getCurrentSlideImages,
  };
}; 