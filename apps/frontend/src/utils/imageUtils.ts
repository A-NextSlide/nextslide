/**
 * Utility functions for image URL processing
 */

/**
 * Ensures an image URL uses HTTPS
 * Converts HTTP URLs to HTTPS to prevent mixed content warnings
 */
export function ensureHttpsUrl(url: string | undefined | null): string {
  if (!url) return '';
  
  // If it's already HTTPS, return as-is
  if (url.startsWith('https://')) {
    return url;
  }
  
  // If it's HTTP, convert to HTTPS
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  
  // If it's a data URL or relative URL, return as-is
  if (url.startsWith('data:') || url.startsWith('/') || url.startsWith('./')) {
    return url;
  }
  
  // If it's protocol-relative (//example.com), prepend HTTPS
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  
  // Otherwise assume it needs HTTPS
  return 'https://' + url;
}

/**
 * Process image data to ensure all URLs use HTTPS
 */
export function processImageUrls<T extends { url?: string; thumbnail?: string; src?: any }>(image: T): T {
  return {
    ...image,
    url: ensureHttpsUrl(image.url),
    thumbnail: ensureHttpsUrl(image.thumbnail),
    src: image.src ? {
      ...image.src,
      thumbnail: ensureHttpsUrl(image.src.thumbnail),
      small: ensureHttpsUrl(image.src.small),
      medium: ensureHttpsUrl(image.src.medium),
      large: ensureHttpsUrl(image.src.large),
      original: ensureHttpsUrl(image.src.original),
    } : undefined
  };
}

/**
 * Process an array of images to ensure all URLs use HTTPS
 */
export function processImageArray<T extends { url?: string; thumbnail?: string; src?: any }>(images: T[]): T[] {
  return images.map(processImageUrls);
} 