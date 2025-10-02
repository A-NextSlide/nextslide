/**
 * Transform backend image data to the format expected by ImageCarousel component
 */

interface BackendImageData {
  slide_id: string;
  slide_title: string;
  images: Array<{
    url: string;
    thumbnail?: string;
    photographer?: string;
    alt?: string;
    description?: string;
    id?: string | number;
    [key: string]: any;
  }>;
}

interface ImageCarouselData {
  slide_id: string;
  slide_title: string;
  images: Array<{
    url: string;
    thumbnail: string;
    photographer?: string;
    alt: string;
    id: number | string;
  }>;
}

export function transformImageDataForCarousel(backendData: BackendImageData[]): ImageCarouselData[] {
  if (!Array.isArray(backendData)) {
    console.warn('transformImageDataForCarousel: Expected array, got:', typeof backendData);
    return [];
  }

  return backendData.map((slide, slideIndex) => ({
    slide_id: slide.slide_id || `slide-${slideIndex}`,
    slide_title: slide.slide_title || `Slide ${slideIndex + 1}`,
    images: (slide.images || []).map((img, imgIndex) => ({
      url: img.url || img.thumbnail || '',
      thumbnail: img.thumbnail || img.url || '',
      photographer: img.photographer,
      alt: img.alt || img.description || `Image ${imgIndex + 1} for ${slide.slide_title || 'slide'}`,
      id: img.id || `${slide.slide_id}-img-${imgIndex}`
    }))
  }));
} 