import { processImageUrls } from '@/utils/imageUtils';

export type SlideImage = {
  id: string;
  url: string;
  thumbnail?: string;
  alt?: string;
  caption?: string;
  relevance_score?: number;
  source?: string;
  photographer?: string;
  photographer_url?: string;
  topic?: string;
  searchQuery?: string;
  width?: number;
  height?: number;
  src?: {
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    original?: string;
  };
};

export type SlideImageCacheEntry = {
  slideId: string;
  slideIndex: number;
  slideTitle: string;
  images: SlideImage[];
  topics?: string[];
  images_by_topic?: Record<string, SlideImage[]>;
  images_by_search_term?: Record<string, SlideImage[]>;
  search_terms?: string[];
  search_terms_hint?: string[];
};

const ensureSlideCache = (): Record<string, SlideImageCacheEntry> | null => {
  if (typeof window === 'undefined') return null;
  if (!window.__slideImageCache) {
    window.__slideImageCache = {} as Record<string, SlideImageCacheEntry>;
  }
  return window.__slideImageCache;
};

const ensureTopicCache = (): Record<string, SlideImage[]> | null => {
  if (typeof window === 'undefined') return null;
  if (!window.__topicImageCache) {
    window.__topicImageCache = {} as Record<string, SlideImage[]>;
  }
  return window.__topicImageCache;
};

const normalizeSlideImage = (
  img: any,
  index: number,
  fallback: {
    topic?: string;
    searchQuery?: string;
    defaultTopic?: string;
    defaultAlt?: string;
  } = {}
): SlideImage | null => {
  const url =
    img?.url ||
    img?.src?.original ||
    img?.src?.large ||
    img?.src?.medium ||
    img?.src?.small ||
    img?.thumbnail ||
    '';

  if (!url) return null;

  const topic = img?.topic || img?.category || fallback.topic || fallback.defaultTopic;
  const baseImage = {
    ...img,
    url,
    thumbnail: img?.thumbnail || url,
    alt: img?.alt || img?.description || fallback.defaultAlt || '',
    caption: img?.caption || '',
    relevance_score: img?.relevance_score ?? 1,
    source: img?.source || 'generation',
    photographer: img?.photographer,
    photographer_url: img?.photographer_url,
    topic,
    searchQuery: img?.searchQuery || fallback.searchQuery,
    width: img?.width,
    height: img?.height,
    src: {
      thumbnail: img?.thumbnail,
      small: img?.small || img?.thumbnail,
      medium: img?.medium || url,
      large: img?.large || url,
      original: url
    }
  } as SlideImage;

  const processed = processImageUrls(baseImage);
  return {
    ...processed,
    id: img?.id || `img-${Date.now()}-${index}`
  } as SlideImage;
};

const emitSlideImagesAvailable = (detail: any) => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('slide_images_available', { detail }));
  } catch {}
};

const cacheEntry = (key: string, entry: SlideImageCacheEntry) => {
  const cache = ensureSlideCache();
  if (!cache) return;
  cache[key] = entry;
};

const cacheBySlideIndex = (slideIndex: number | undefined, entry: SlideImageCacheEntry) => {
  if (slideIndex === undefined || slideIndex === null) return;
  cacheEntry(`slide_index_${slideIndex}`, entry);
};

export const cacheAvailableImages = (
  slideId: string,
  slideIndex: number,
  slideData: any
): SlideImageCacheEntry | null => {
  if (!slideId) return null;
  if (!slideData?.availableImages || slideData.availableImages.length === 0) return null;

  const images = slideData.availableImages
    .map((img: any, index: number) =>
      normalizeSlideImage(img, index, {
        defaultTopic: slideData.title?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'general',
        defaultAlt: slideData.title || ''
      })
    )
    .filter(Boolean) as SlideImage[];

  if (images.length === 0) return null;

  const imagesByTopic: Record<string, SlideImage[]> = {};
  images.forEach(image => {
    const topic = image.topic || 'general';
    if (!imagesByTopic[topic]) {
      imagesByTopic[topic] = [];
    }
    imagesByTopic[topic].push(image);
  });

  const topics = Object.keys(imagesByTopic).filter(topic =>
    topic !== 'general' || Object.keys(imagesByTopic).length === 1
  );

  const entry: SlideImageCacheEntry = {
    slideId,
    slideIndex,
    slideTitle: slideData.title || `Slide ${slideIndex + 1}`,
    images,
    topics,
    images_by_topic: imagesByTopic
  };

  cacheEntry(slideId, entry);
  emitSlideImagesAvailable({
    slideId,
    slideIndex,
    images,
    topics,
    images_by_topic: imagesByTopic
  });

  return entry;
};

export const cacheImagesBySearchTerm = (payload: {
  slide_id?: string;
  slide_index?: number;
  slide_title?: string;
  search_terms?: string[];
  images_by_search_term?: Record<string, any[]>;
}): SlideImageCacheEntry | null => {
  const { slide_id, slide_index, slide_title, search_terms, images_by_search_term } = payload || {};
  if (!slide_id || !images_by_search_term || Object.keys(images_by_search_term).length === 0) return null;

  const allImages: SlideImage[] = [];
  const seenUrls = new Set<string>();

  Object.entries(images_by_search_term).forEach(([searchTerm, termImages]) => {
    if (!Array.isArray(termImages)) return;
    termImages.forEach((img: any, idx: number) => {
      const normalized = normalizeSlideImage(img, idx, {
        topic: searchTerm,
        searchQuery: searchTerm
      });
      if (!normalized) return;
      if (seenUrls.has(normalized.url)) return;
      seenUrls.add(normalized.url);
      allImages.push(normalized);
    });
  });

  if (allImages.length === 0) return null;

  const entry: SlideImageCacheEntry = {
    slideId: slide_id,
    slideIndex: slide_index ?? 0,
    slideTitle: slide_title || `Slide ${(slide_index ?? 0) + 1}`,
    images: allImages,
    images_by_search_term: images_by_search_term as Record<string, SlideImage[]>,
    search_terms: search_terms || Object.keys(images_by_search_term)
  };

  cacheEntry(slide_id, entry);
  cacheBySlideIndex(slide_index, entry);

  emitSlideImagesAvailable({
    slideId: slide_id,
    slideIndex: slide_index,
    images: allImages,
    searchTerms: entry.search_terms,
    isSlideSpecific: true
  });

  return entry;
};

export const cacheImagesByTopic = (payload: {
  slide_id?: string;
  slide_index?: number;
  slide_title?: string;
  topics?: string[];
  images_by_topic?: Record<string, any[]>;
}): SlideImageCacheEntry | null => {
  const { slide_id, slide_index, slide_title, topics, images_by_topic } = payload || {};
  if (!slide_id || !images_by_topic || Object.keys(images_by_topic).length === 0) return null;

  const images: SlideImage[] = [];
  const imagesByTopic: Record<string, SlideImage[]> = {};
  const seenUrls = new Set<string>();

  Object.entries(images_by_topic).forEach(([topic, topicImages]) => {
    if (!Array.isArray(topicImages)) return;
    imagesByTopic[topic] = [];
    topicImages.forEach((img: any, idx: number) => {
      const normalized = normalizeSlideImage(img, idx, { topic });
      if (!normalized) return;
      if (seenUrls.has(normalized.url)) return;
      seenUrls.add(normalized.url);
      images.push(normalized);
      imagesByTopic[topic].push(normalized);
    });
  });

  if (images.length === 0) return null;

  const entry: SlideImageCacheEntry = {
    slideId: slide_id,
    slideIndex: slide_index ?? 0,
    slideTitle: slide_title || `Slide ${(slide_index ?? 0) + 1}`,
    images,
    topics: topics || Object.keys(imagesByTopic),
    images_by_topic: imagesByTopic
  };

  cacheEntry(slide_id, entry);
  cacheBySlideIndex(slide_index, entry);

  emitSlideImagesAvailable({
    slideId: slide_id,
    slideIndex: slide_index,
    slideTitle: entry.slideTitle,
    images,
    topics: entry.topics,
    images_by_topic: imagesByTopic
  });

  return entry;
};

export const cacheFlatImagesForSlide = (payload: {
  slide_id?: string;
  slide_index?: number;
  slide_title?: string;
  images?: any[];
}): SlideImageCacheEntry | null => {
  const { slide_id, slide_index, slide_title, images } = payload || {};
  if (!slide_id || !Array.isArray(images) || images.length === 0) return null;

  const normalizedImages = images
    .map((img: any, index: number) => normalizeSlideImage(img, index))
    .filter(Boolean) as SlideImage[];

  if (normalizedImages.length === 0) return null;

  const imagesByTopic: Record<string, SlideImage[]> = {};
  normalizedImages.forEach(image => {
    const topic = image.topic || 'general';
    if (!imagesByTopic[topic]) {
      imagesByTopic[topic] = [];
    }
    imagesByTopic[topic].push(image);
  });

  const entry: SlideImageCacheEntry = {
    slideId: slide_id,
    slideIndex: slide_index ?? 0,
    slideTitle: slide_title || `Slide ${(slide_index ?? 0) + 1}`,
    images: normalizedImages,
    topics: Object.keys(imagesByTopic),
    images_by_topic: imagesByTopic
  };

  cacheEntry(slide_id, entry);
  cacheBySlideIndex(slide_index, entry);

  emitSlideImagesAvailable({
    slideId: slide_id,
    slideIndex: slide_index,
    images: normalizedImages
  });

  return entry;
};

export const cacheTopicImages = (payload: {
  topic?: string;
  images?: any[];
  image_count?: number;
}): void => {
  const { topic, images } = payload || {};
  if (!topic || !Array.isArray(images) || images.length === 0) return;

  const cache = ensureTopicCache();
  if (!cache) return;

  cache[topic] = images as SlideImage[];

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('topic_images_available', {
      detail: {
        topic,
        images,
        image_count: images.length
      }
    }));
  }
};
