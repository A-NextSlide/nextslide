import {
  cacheAvailableImages,
  cacheFlatImagesForSlide,
  cacheImagesBySearchTerm,
  cacheImagesByTopic,
  cacheTopicImages
} from './imageCache';

export type CarouselSlide = {
  slide_id: string;
  slide_title: string;
  images: Array<{
    url: string;
    thumbnail?: string;
    alt?: string;
    id?: string;
  }>;
};

export type ImageEventResult = {
  shouldReturnEarly: boolean;
  carousel?: {
    slides: CarouselSlide[];
    totalImages: number;
  };
};

const getAutoSelectImagesPref = () => {
  if (typeof window === 'undefined') return undefined;
  return (window as any).__slideGenerationPreferences?.autoSelectImages;
};

const dispatchImagesReadyForSelection = (deckId?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('images_ready_for_selection', {
    detail: {
      deck_id: deckId,
      deck_uuid: deckId
    }
  }));
};

const handleSlideImagesPayload = (payload: any) => {
  if (!payload) return;

  if (payload.images_by_search_term && Object.keys(payload.images_by_search_term).length > 0) {
    cacheImagesBySearchTerm(payload);
    return;
  }

  if (payload.images_by_topic && Object.keys(payload.images_by_topic).length > 0) {
    cacheImagesByTopic(payload);
    return;
  }

  if (payload.images && Array.isArray(payload.images) && payload.images.length > 0) {
    cacheFlatImagesForSlide(payload);
  }
};

const buildCarouselSlides = (data: any): { slides: CarouselSlide[]; totalImages: number } => {
  const slides: CarouselSlide[] = [];
  let totalImages = 0;

  if (Array.isArray(data?.images_by_slide)) {
    data.images_by_slide.forEach((slideData: any) => {
      const images: CarouselSlide['images'] = [];
      if (slideData.images_by_topic) {
        Object.values(slideData.images_by_topic).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            arr.forEach((img: any) => {
              images.push({
                url: img.url,
                thumbnail: img.thumbnail || img.url,
                alt: img.alt || img.caption || '',
                id: img.id || img.url
              });
            });
          }
        });
      } else if (Array.isArray(slideData.images)) {
        slideData.images.forEach((img: any) => {
          images.push({
            url: img.url,
            thumbnail: img.thumbnail || img.url,
            alt: img.alt || img.caption || '',
            id: img.id || img.url
          });
        });
      }
      totalImages += images.length;
      slides.push({
        slide_id: slideData.slide_id,
        slide_title: slideData.slide_title || `Slide ${(slideData.slide_index || 0) + 1}`,
        images
      });
    });
  } else if (data?.slide_images && typeof data.slide_images === 'object') {
    Object.entries(data.slide_images).forEach(([slideId, arr]: [string, any]) => {
      const images = Array.isArray(arr)
        ? arr.map((img: any) => ({
            url: img.url,
            thumbnail: img.thumbnail || img.url,
            alt: img.alt || img.caption || '',
            id: img.id || img.url
          }))
        : [];
      totalImages += images.length;
      const cached = (window as any).__slideImageCache?.[slideId];
      const title = cached?.slideTitle || `Slide ${(cached?.slideIndex || 0) + 1}`;
      slides.push({ slide_id: slideId, slide_title: title, images });
    });
  }

  return { slides, totalImages };
};

export const handleImageEvents = (event: any, options: { deckId?: string } = {}): ImageEventResult => {
  if (!event) return { shouldReturnEarly: false };

  const autoSelectImages = getAutoSelectImagesPref();
  if (event.stage === 'image_collection' && autoSelectImages) {
    return { shouldReturnEarly: true };
  }

  if (event.stage === 'image_collection') {
    if (event.message && event.message.includes('Images ready for slide')) {
      const slideMatch = event.message.match(/Images ready for slide (\d+)/);
      if (slideMatch) {
        const slideNumber = parseInt(slideMatch[1], 10);
        const slideIndex = slideNumber - 1;
        const images = event.data?.images || event.data?.data?.images;
        const slideId = event.data?.slide_id || event.data?.data?.slide_id;
        if (Array.isArray(images) && images.length > 0 && slideId) {
          cacheFlatImagesForSlide({
            slide_id: slideId,
            slide_index: slideIndex,
            slide_title: `Slide ${slideNumber}`,
            images
          });
        }
      }
    }

    if (event.data?.type === 'slide_images_found') {
      handleSlideImagesPayload(event.data?.data || event.data);
    }
  }

  const candidates = [event, event.data, event.data?.data].filter(Boolean);
  candidates.forEach(candidate => {
    if (candidate.type === 'slide_images_found' || candidate.type === 'slide_images_available') {
      handleSlideImagesPayload(candidate.data || candidate);
    }

    if (candidate.type === 'topic_images_found') {
      cacheTopicImages(candidate.data || candidate);
    }

    if (candidate.type === 'slide_generated' && candidate.slide_data?.availableImages) {
      const slideIndex = candidate.slide_index ?? candidate.data?.slide_index;
      const slideId = candidate.slide_data?.components?.[0]?.slide_id;
      if (slideId) {
        cacheAvailableImages(slideId, slideIndex || 0, candidate.slide_data);
      }
    }

    if (candidate.images_by_topic || candidate.images_by_search_term || candidate.images) {
      handleSlideImagesPayload(candidate);
    }

    if (candidate.data?.images_by_topic || candidate.data?.images_by_search_term || candidate.data?.images) {
      handleSlideImagesPayload(candidate.data);
    }
  });

  if (event.data?.type === 'slide_generated' && event.data.slide_data?.availableImages) {
    const slideData = event.data.slide_data;
    const slideIndex = event.data.slide_index ?? 0;
    const slideId = slideData.components?.[0]?.slide_id;
    if (slideId) {
      cacheAvailableImages(slideId, slideIndex, slideData);
    }
  }

  if (event.stage === 'image_collection' && Array.isArray(event.data?.images_by_slide)) {
    event.data.images_by_slide.forEach((slideData: any) => {
      handleSlideImagesPayload(slideData);
    });
    dispatchImagesReadyForSelection(options.deckId);
  }

  if (event.type === 'images_collection_complete' && event.data) {
    if (Array.isArray(event.data.images_by_slide)) {
      event.data.images_by_slide.forEach((slideData: any) => {
        handleSlideImagesPayload(slideData);
      });
    }

    if (event.data.slide_images && typeof event.data.slide_images === 'object') {
      Object.entries(event.data.slide_images).forEach(([slideId, images]: [string, any]) => {
        if (Array.isArray(images) && images.length > 0) {
          const cached = (window as any).__slideImageCache?.[slideId];
          const slideIndex = cached?.slideIndex || 0;
          const slideTitle = cached?.slideTitle || `Slide ${slideIndex + 1}`;
          cacheFlatImagesForSlide({
            slide_id: slideId,
            slide_index: slideIndex,
            slide_title: slideTitle,
            images
          });
        }
      });
    }

    const carousel = buildCarouselSlides(event.data);
    if (carousel.slides.length > 0) {
      return { shouldReturnEarly: false, carousel };
    }
  }

  if (event.type === 'images_ready_for_selection' && event.data) {
    if (Array.isArray(event.data.images_by_slide)) {
      event.data.images_by_slide.forEach((slideData: any) => {
        handleSlideImagesPayload(slideData);
      });
    }
  }

  if (event.type === 'topic_images_found' && event.data) {
    cacheTopicImages(event.data);
  }

  if (event.type === 'slide_images_found' && event.data) {
    handleSlideImagesPayload(event.data);
  }

  return { shouldReturnEarly: false };
};
