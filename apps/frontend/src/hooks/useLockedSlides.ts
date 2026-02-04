/**
 * useLockedSlides Hook
 *
 * Derives locked slide state from deck's lockedSlideInfo.
 * Used to determine which slides are locked for freemium users.
 */

import { useMemo, useCallback } from 'react';
import { useDeckStore } from '@/stores/deckStore';
import { useShallow } from 'zustand/react/shallow';
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
  // Extract only the primitive values we need, so the selector returns a stable
  // result that won't trigger re-renders when unrelated deckData fields change.
  const { unlockedCountRaw, totalCountRaw, lockedAt, slidesLength } = useDeckStore(
    useShallow(state => {
      const deckData = state.deckData as any;
      if (!deckData) return { unlockedCountRaw: undefined, totalCountRaw: undefined, lockedAt: undefined, slidesLength: 0 };
      const info = deckData.lockedSlideInfo || deckData.locked_slide_info;
      if (!info) return { unlockedCountRaw: undefined, totalCountRaw: undefined, lockedAt: undefined, slidesLength: deckData.slides?.length ?? 0 };
      return {
        unlockedCountRaw: info.unlockedCount ?? info.unlocked_count,
        totalCountRaw: info.totalCount ?? info.total_count,
        lockedAt: info.lockedAt ?? info.locked_at,
        slidesLength: deckData.slides?.length ?? 0,
      };
    })
  );
  const hasInfo = unlockedCountRaw !== undefined || totalCountRaw !== undefined || lockedAt !== undefined;

  // Derive counts directly from the extracted primitives (all stable values)
  const unlockedCount = hasInfo ? (unlockedCountRaw ?? slidesLength) : slidesLength;
  const totalCount = hasInfo ? (totalCountRaw ?? slidesLength) : slidesLength;
  const lockedCount = Math.max(0, totalCount - unlockedCount);
  const hasLockedSlides = lockedCount > 0;

  const isLocked = useCallback((slideIndex: number): boolean => {
    if (!hasInfo) return false;
    return slideIndex >= unlockedCount;
  }, [hasInfo, unlockedCount]);

  // Reconstruct lockedSlideInfo only for consumers that need the raw object
  const lockedSlideInfo: LockedSlideInfo | undefined = useMemo(() => {
    if (!hasInfo) return undefined;
    return { unlockedCount: unlockedCountRaw!, totalCount: totalCountRaw!, lockedAt } as any;
  }, [hasInfo, unlockedCountRaw, totalCountRaw, lockedAt]);

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
