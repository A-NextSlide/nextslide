/**
 * Cache management for presentation mode thumbnails on mobile.
 * Stores screenshot data URLs to replace heavy MiniSlide renders with static images.
 */

interface CachedThumbnail {
  dataUrl: string;
  timestamp: number;
  componentHash: string;
}

// In-memory cache map
const thumbnailCache = new Map<string, CachedThumbnail>();

// Cache expiry time (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Generate a hash from slide components for change detection.
 * Returns a string that changes when slide content changes.
 */
export function generateSlideHash(slide: { id: string; components?: any[] } | null): string {
  if (!slide) return 'empty';

  try {
    // Use slide ID + simplified component structure
    const componentSummary = (slide.components || []).map((c: any) => ({
      id: c.id,
      type: c.type,
      // Include key props that affect rendering
      text: c.props?.text?.substring?.(0, 50),
      src: c.props?.src,
      backgroundColor: c.props?.backgroundColor,
    }));

    return `${slide.id}:${JSON.stringify(componentSummary)}`;
  } catch {
    return slide.id;
  }
}

/**
 * Get a cached thumbnail if it exists and is still valid.
 */
export function getCachedThumbnail(slideId: string): string | null {
  const cached = thumbnailCache.get(slideId);

  if (!cached) return null;

  // Check if expired
  if (Date.now() - cached.timestamp > CACHE_EXPIRY_MS) {
    thumbnailCache.delete(slideId);
    return null;
  }

  return cached.dataUrl;
}

/**
 * Get cached thumbnail with hash validation.
 * Returns null if the slide content has changed.
 */
export function getCachedThumbnailWithHash(
  slideId: string,
  currentHash: string
): string | null {
  const cached = thumbnailCache.get(slideId);

  if (!cached) return null;

  // Check if expired
  if (Date.now() - cached.timestamp > CACHE_EXPIRY_MS) {
    thumbnailCache.delete(slideId);
    return null;
  }

  // Check if content changed
  if (cached.componentHash !== currentHash) {
    thumbnailCache.delete(slideId);
    return null;
  }

  return cached.dataUrl;
}

/**
 * Store a thumbnail in the cache.
 */
export function setCachedThumbnail(
  slideId: string,
  dataUrl: string,
  componentHash: string
): void {
  thumbnailCache.set(slideId, {
    dataUrl,
    timestamp: Date.now(),
    componentHash,
  });
}

/**
 * Clear a specific thumbnail from cache.
 */
export function clearCachedThumbnail(slideId: string): void {
  thumbnailCache.delete(slideId);
}

/**
 * Clear all thumbnails from cache.
 */
export function clearAllThumbnails(): void {
  thumbnailCache.clear();
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): { size: number; slideIds: string[] } {
  return {
    size: thumbnailCache.size,
    slideIds: Array.from(thumbnailCache.keys()),
  };
}

/**
 * Clean up expired entries from the cache.
 */
export function cleanupExpiredThumbnails(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [slideId, cached] of thumbnailCache.entries()) {
    if (now - cached.timestamp > CACHE_EXPIRY_MS) {
      thumbnailCache.delete(slideId);
      cleaned++;
    }
  }

  return cleaned;
}
