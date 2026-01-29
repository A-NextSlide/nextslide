/**
 * Hook for caching community deck thumbnails as screenshots on mobile.
 * Similar to useDeckThumbnailCache but for community gallery.
 * Captures screenshots of rendered community deck thumbnails and caches them
 * to show static images instead of re-rendering heavy MiniSlide components.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { captureTinySlideScreenshot } from '@/utils/slideScreenshot';
import { BROWSER } from '@/utils/browser';

interface CachedThumbnail {
  dataUrl: string;
  timestamp: number;
}

// In-memory cache - persists across component remounts
const thumbnailCache = new Map<string, CachedThumbnail>();

// Cache expiry time (15 minutes - community decks don't change as often)
const CACHE_EXPIRY_MS = 15 * 60 * 1000;

export interface UseCommunityThumbnailCacheResult {
  /** Get cached thumbnail URL for a community deck */
  getCachedThumbnail: (deckId: string) => string | null;
  /** Check if a deck has a valid cached thumbnail */
  hasCachedThumbnail: (deckId: string) => boolean;
  /** Capture and cache a thumbnail for a deck */
  captureThumbnail: (deckId: string, element: HTMLElement) => Promise<boolean>;
  /** Clear cache for a specific deck */
  clearThumbnail: (deckId: string) => void;
  /** Force re-render when cache changes */
  cacheVersion: number;
}

export function useCommunityThumbnailCache(): UseCommunityThumbnailCacheResult {
  const [cacheVersion, setCacheVersion] = useState(0);
  const isCapturingRef = useRef<Set<string>>(new Set());

  // Clean up expired entries periodically
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      let cleaned = 0;
      for (const [deckId, cached] of thumbnailCache.entries()) {
        if (now - cached.timestamp > CACHE_EXPIRY_MS) {
          thumbnailCache.delete(deckId);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[CommunityThumbnailCache] Cleaned ${cleaned} expired entries`);
        setCacheVersion(v => v + 1);
      }
    };

    // Clean up every 3 minutes
    const interval = setInterval(cleanup, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getCachedThumbnail = useCallback((deckId: string): string | null => {
    const cached = thumbnailCache.get(deckId);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > CACHE_EXPIRY_MS) {
      thumbnailCache.delete(deckId);
      return null;
    }

    return cached.dataUrl;
  }, []);

  const hasCachedThumbnail = useCallback((deckId: string): boolean => {
    return getCachedThumbnail(deckId) !== null;
  }, [getCachedThumbnail]);

  const captureThumbnail = useCallback(async (deckId: string, element: HTMLElement): Promise<boolean> => {
    // Skip if not on mobile or already capturing
    if (!BROWSER.isMobile) return false;
    if (isCapturingRef.current.has(deckId)) return false;
    if (thumbnailCache.has(deckId)) return true; // Already cached

    isCapturingRef.current.add(deckId);

    try {
      // Wait a bit for the thumbnail to fully render
      await new Promise(r => setTimeout(r, 250));

      const dataUrl = await captureTinySlideScreenshot(element, { skipIframeCapture: true });

      if (dataUrl) {
        thumbnailCache.set(deckId, {
          dataUrl,
          timestamp: Date.now(),
        });
        console.log(`[CommunityThumbnailCache] Captured: ${deckId}`);
        setCacheVersion(v => v + 1);
        return true;
      }
    } catch (err) {
      console.error(`[CommunityThumbnailCache] Failed to capture ${deckId}:`, err);
    } finally {
      isCapturingRef.current.delete(deckId);
    }

    return false;
  }, []);

  const clearThumbnail = useCallback((deckId: string) => {
    if (thumbnailCache.delete(deckId)) {
      setCacheVersion(v => v + 1);
    }
  }, []);

  return {
    getCachedThumbnail,
    hasCachedThumbnail,
    captureThumbnail,
    clearThumbnail,
    cacheVersion,
  };
}

/**
 * Clear all cached community thumbnails (call when user logs out or clears data)
 */
export function clearAllCommunityThumbnails(): void {
  thumbnailCache.clear();
}

/**
 * Get cache stats for debugging
 */
export function getCommunityThumbnailCacheStats(): { size: number; deckIds: string[] } {
  return {
    size: thumbnailCache.size,
    deckIds: Array.from(thumbnailCache.keys()),
  };
}
