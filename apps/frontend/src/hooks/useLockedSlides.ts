/**
 * useLockedSlides Hook
 *
 * Derives locked slide state from deck's lockedSlideInfo.
 * Used to determine which slides are locked for freemium users.
 */

import { useMemo, useCallback } from 'react';
import { useDeckStore } from '@/stores/deckStore';
import { LockedSlideInfo } from '@/types/DeckTypes';

interface UseLockedSlidesReturn {
  /** Check if a specific slide index is locked */
  isLocked: (slideIndex: number) => boolean;
  /** Whether the deck has any locked slides */
  hasLockedSlides: boolean;
  /** Number of locked slides */
  lockedCount: number;
  /** Number of unlocked slides */
  unlockedCount: number;
  /** Total number of slides */
  totalCount: number;
  /** Raw locked slide info from deck */
  lockedSlideInfo: LockedSlideInfo | undefined;
}

/**
 * Hook to derive locked slide state from deck metadata.
 *
 * Slides are considered locked if:
 * - The deck has lockedSlideInfo
 * - The slide index >= unlockedCount
 *
 * @returns Object with locked slide state and helper functions
 */
export function useLockedSlides(): UseLockedSlidesReturn {
  // Handle both camelCase and snake_case from backend
  const lockedSlideInfo = useDeckStore(state => {
    const deckData = state.deckData as any;
    if (!deckData) return undefined;
    // Check camelCase first, then snake_case
    const info = deckData.lockedSlideInfo || deckData.locked_slide_info;
    // Debug logging
    if (info) {
      console.log('[useLockedSlides] Found locked_slide_info:', info);
    }
    return info;
  });
  const slidesLength = useDeckStore(state => state.deckData?.slides?.length ?? 0);

  // Derive counts from lockedSlideInfo (handle both camelCase and snake_case)
  const { unlockedCount, totalCount, lockedCount, hasLockedSlides } = useMemo(() => {
    if (!lockedSlideInfo) {
      return {
        unlockedCount: slidesLength,
        totalCount: slidesLength,
        lockedCount: 0,
        hasLockedSlides: false
      };
    }

    // Handle both camelCase and snake_case field names
    const info = lockedSlideInfo as any;
    const unlocked = info.unlockedCount ?? info.unlocked_count ?? slidesLength;
    const total = info.totalCount ?? info.total_count ?? slidesLength;
    const locked = Math.max(0, total - unlocked);

    console.log('[useLockedSlides] Derived counts:', { unlocked, total, locked, hasLocked: locked > 0 });

    return {
      unlockedCount: unlocked,
      totalCount: total,
      lockedCount: locked,
      hasLockedSlides: locked > 0
    };
  }, [lockedSlideInfo, slidesLength]);

  // Check if a specific slide index is locked
  const isLocked = useCallback((slideIndex: number): boolean => {
    if (!lockedSlideInfo) return false;
    // Use the derived unlockedCount which handles both case formats
    return slideIndex >= unlockedCount;
  }, [lockedSlideInfo, unlockedCount]);

  return {
    isLocked,
    hasLockedSlides,
    lockedCount,
    unlockedCount,
    totalCount,
    lockedSlideInfo
  };
}

export default useLockedSlides;
