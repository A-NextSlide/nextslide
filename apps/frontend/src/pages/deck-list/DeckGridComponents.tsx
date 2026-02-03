/**
 * Extracted components from DeckList.tsx for better code organization.
 * Contains: RotatingWords, VirtualizedDeckGrid, VirtualizedPopupDeckGrid
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Trash2, Check, X, ArrowUpDown } from 'lucide-react';
import DeckCard from '@/components/deck/DeckCard';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { formatDistanceToNow } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { BROWSER } from '@/utils/browser';
import { useDeckThumbnailCache } from '@/hooks/useDeckThumbnailCache';

// Rotating words animation for hero heading - vertical slot machine style
const WORDS = ['PROPOSALS', 'STRATEGIES', 'REPORTS', 'DOCS', 'NOTES', 'IDEAS'];

export const RotatingWords = ({ compact = false }: { compact?: boolean }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasStartedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Prevent double-execution in React StrictMode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Start animation after a short delay
    const startDelay = setTimeout(() => {
      timerRef.current = setInterval(() => {
        setCurrentIndex(i => {
          const nextIndex = i + 1;
          if (nextIndex >= WORDS.length - 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return WORDS.length - 1;
          }
          return nextIndex;
        });
      }, 2000); // 2 seconds per word - slower for more visible rotation
    }, 800); // Wait 0.8s before starting

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Character widths for each word to animate container width
  const wordWidths: Record<string, string> = {
    'PROPOSALS': '10ch',
    'STRATEGIES': '11ch',
    'REPORTS': '8ch',
    'DOCS': '5ch',
    'NOTES': '6ch',
    'IDEAS': '5.5ch',
  };

  return (
    <span
      className="text-orange-500 inline-block overflow-hidden transition-[width] duration-300 mx-1 sm:mx-2"
      style={{
        height: compact ? '0.9em' : '1em',
        width: wordWidths[WORDS[currentIndex]],
        verticalAlign: 'baseline',
        position: 'relative',
        top: compact ? '0.05em' : '0.15em',
      }}
    >
      <span
        className="flex flex-col"
        style={{
          transform: `translateY(-${currentIndex * 1}em)`,
          transition: 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {WORDS.map((word) => (
          <span
            key={word}
            className="whitespace-nowrap"
            style={{ height: '1em', lineHeight: '1em' }}
          >
            {word}
          </span>
        ))}
      </span>
    </span>
  );
};

interface VirtualizedDeckGridProps {
  decks: CompleteDeckData[] | any;
  onEdit: (deck: CompleteDeckData) => void;
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoad: boolean;
}

// Virtualized deck grid component for better performance with many decks
export const VirtualizedDeckGrid = React.memo(({
  decks,
  onEdit,
  onShowDeleteDialog,
  onLoadMore,
  hasMore,
  isLoadingMore,
  isInitialLoad
}: VirtualizedDeckGridProps) => {
  const isMobile = useIsMobile();
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];

  // Screenshot caching for mobile thumbnails
  const { getCachedThumbnail, hasCachedThumbnail, captureThumbnail, cacheVersion } = useDeckThumbnailCache();

  // Mobile rendering: render ALL visible items live, capture in background
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const thumbnailRefsMapRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Visibility tracking
  const visibleDecksRef = useRef<Set<number>>(new Set());
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State: once an item enters the viewport, it stays rendered
  const [renderedDecks, setRenderedDecks] = useState<Set<number>>(() => {
    // On desktop, render first few immediately; mobile uses progressive timer below
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });

  // Mobile: progressive render via timer (IntersectionObserver unreliable on mobile)
  // Adds items in batches of 3 every 150ms so the browser isn't overwhelmed
  const mobileRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!BROWSER.isMobile) return;
    if (safeDecks.length === 0) return;

    let batch = 0;
    const BATCH_SIZE = 3;
    const BATCH_DELAY = 150; // ms between batches

    const addBatch = () => {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, safeDecks.length);
      if (start >= safeDecks.length) return;

      setRenderedDecks(prev => {
        const next = new Set(prev);
        for (let i = start; i < end; i++) next.add(i);
        return next;
      });
      batch++;

      if (end < safeDecks.length) {
        mobileRenderTimerRef.current = setTimeout(addBatch, BATCH_DELAY);
      }
    };

    // Start first batch immediately
    addBatch();

    return () => {
      if (mobileRenderTimerRef.current) clearTimeout(mobileRenderTimerRef.current);
    };
  }, [safeDecks.length]);

  // Track initial visibility for animations (desktop only)
  const [initiallyVisibleDecks, setInitiallyVisibleDecks] = useState<Set<number>>(() => {
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const hasCheckedInitialVisibility = useRef(false);

  // Refs for cache functions
  const hasCachedThumbnailRef = useRef(hasCachedThumbnail);
  hasCachedThumbnailRef.current = hasCachedThumbnail;
  const captureThumbnailRef = useRef(captureThumbnail);
  captureThumbnailRef.current = captureThumbnail;
  const safeDecksRef = useRef(safeDecks);
  safeDecksRef.current = safeDecks;

  // Debug: Log mobile detection once
  const hasLoggedRef = useRef(false);
  if (!hasLoggedRef.current) {
    hasLoggedRef.current = true;
    console.log(`[DeckGrid] BROWSER.isMobile=${BROWSER.isMobile} isIOS=${BROWSER.isIOS} isChrome=${BROWSER.isChrome} isAndroid=${BROWSER.isAndroid}`);
  }

  // Background capture: pick the first visible uncached item and screenshot it
  const processCaptureQueue = useCallback(() => {
    if (!BROWSER.isMobile) return;
    if (isScrollingRef.current) return;

    for (const index of Array.from(visibleDecksRef.current).sort((a, b) => a - b)) {
      const deck = safeDecksRef.current[index];
      if (!deck?.uuid) continue;
      if (hasCachedThumbnailRef.current(deck.uuid)) continue;

      const element = thumbnailRefsMapRef.current.get(deck.uuid);
      if (!element) continue;

      console.log(`[DeckGrid] 📸 Background capture: #${index}`);
      captureThumbnailRef.current(deck.uuid, element);
      return; // One at a time — hook blocks concurrent captures
    }
  }, []);

  // When a capture completes (success or fail), try the next one
  useEffect(() => {
    if (BROWSER.isMobile) {
      const timer = setTimeout(processCaptureQueue, 300);
      return () => clearTimeout(timer);
    }
  }, [cacheVersion, processCaptureQueue]);

  // Check initial visibility for desktop animations
  useEffect(() => {
    if (!hasCheckedInitialVisibility.current && decks.length > 0 && itemRefs.current.size > 0) {
      setTimeout(() => {
        const visibleIndexes = new Set<number>();
        let scrollContainer = containerRef.current?.parentElement;
        while (scrollContainer && scrollContainer !== document.body) {
          const style = window.getComputedStyle(scrollContainer);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
          scrollContainer = scrollContainer.parentElement;
        }
        const containerRect = scrollContainer?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
        itemRefs.current.forEach((element, index) => {
          const rect = element.getBoundingClientRect();
          if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
            visibleIndexes.add(index);
          }
        });
        setInitiallyVisibleDecks(visibleIndexes);
        hasCheckedInitialVisibility.current = true;
      }, 100);
    }
  }, [safeDecks.length]);

  // Track scrolling to pause capture and batch visibility updates
  useEffect(() => {
    if (!BROWSER.isMobile) return;
    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        processCaptureQueue();
      }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [processCaptureQueue]);

  // Intersection observer for visibility
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedElementsRef = useRef<Set<HTMLDivElement>>(new Set());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');

          if (entry.isIntersecting) {
            visibleDecksRef.current.add(index);
            // Both mobile and desktop: once rendered, stay rendered
            // MiniSlide self-virtualizes its heavy content (iframes) via its own IntersectionObserver
            setRenderedDecks(prev => {
              if (prev.has(index)) return prev;
              return new Set(prev).add(index);
            });
          } else {
            visibleDecksRef.current.delete(index);

            if (BROWSER.isMobile) {
              // Capture screenshot before content unloads
              const deck = safeDecksRef.current[index];
              if (deck?.uuid) {
                const thumbnailEl = thumbnailRefsMapRef.current.get(deck.uuid);
                if (thumbnailEl && !hasCachedThumbnailRef.current(deck.uuid)) {
                  captureThumbnailRef.current(deck.uuid, thumbnailEl);
                }
              }
            }
          }
        });
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );

    itemRefs.current.forEach((element) => {
      if (!observedElementsRef.current.has(element)) {
        observerRef.current?.observe(element);
        observedElementsRef.current.add(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedElementsRef.current.clear();
    };
  }, [processCaptureQueue]);

  // Re-observe when deck count changes
  useEffect(() => {
    if (!observerRef.current) return;
    const timer = setTimeout(() => {
      itemRefs.current.forEach((element) => {
        if (!observedElementsRef.current.has(element)) {
          observerRef.current?.observe(element);
          observedElementsRef.current.add(element);
        }
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [safeDecks.length]);

  // Infinite scroll observer
  useEffect(() => {
    const findScrollContainer = () => {
      let element = containerRef.current?.parentElement;
      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') return element;
        element = element.parentElement;
      }
      return null;
    };

    scrollContainerRef.current = findScrollContainer();
    if (!scrollContainerRef.current || !loadMoreTriggerRef.current || !hasMore) return;

    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px', threshold: 0 }
    );
    scrollObserver.observe(loadMoreTriggerRef.current);
    return () => scrollObserver.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Track which items have been rendered (for showing cached on scroll back)
  const hasBeenRenderedRef = useRef<Set<string>>(new Set());

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-3 auto-rows-max">
      {safeDecks.map((deck, index) => {
        // Only animate if this card was initially visible (desktop only)
        const shouldAnimate = initiallyVisibleDecks.has(index);
        const shouldRender = renderedDecks.has(index);

        // Track that this item has been rendered
        if (shouldRender && deck.uuid) {
          hasBeenRenderedRef.current.add(deck.uuid);
        }

        // Mobile & Desktop app: prefer server thumbnail or client cache to avoid
        // heavy MiniSlide DOM rendering that exceeds Chromium's GPU tile budget
        const cachedUrl = (BROWSER.isMobile || BROWSER.isDesktopApp)
          ? ((deck as any).thumbnail_url || (deck.uuid ? getCachedThumbnail(deck.uuid) : null))
          : null;

        // Mobile: progressive timer populates renderedDecks in batches
        // Desktop: IntersectionObserver populates renderedDecks on scroll
        const showDeckCard = shouldRender;

        return (
          <div
            key={deck.uuid}
            ref={(el) => {
              if (el) itemRefs.current.set(index, el);
            }}
            data-index={index}
          >
            {showDeckCard ? (
              <DeckCard
                deck={deck}
                onEdit={onEdit}
                onShowDeleteDialog={onShowDeleteDialog}
                index={index}
                shouldAnimate={shouldAnimate}
                thumbnailRenderMode="full"
                cachedThumbnailUrl={cachedUrl}
                onThumbnailRef={(el) => {
                  if (el && deck.uuid) {
                    thumbnailRefsMapRef.current.set(deck.uuid, el);
                  } else if (deck.uuid) {
                    thumbnailRefsMapRef.current.delete(deck.uuid);
                  }
                }}
              />
            ) : (
              /* Placeholder with deck info - clickable to navigate immediately */
              <div
                className="relative aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden"
                onClick={() => onEdit(deck)}
              >
                {/* Show cached thumbnail in placeholder if available */}
                {cachedUrl && (
                  <img
                    src={cachedUrl}
                    alt={deck.name || 'Deck thumbnail'}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                )}
                {/* Title overlay at bottom - same style as DeckCard */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-2 px-3">
                  <h3 className="text-sm font-bold text-white truncate">
                    {deck.name || 'Untitled presentation'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-white/70 whitespace-nowrap">
                      {deck.slides?.length ? `${deck.slides.length} slides` : 'Loading...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreTriggerRef} className="py-4">
          {isLoadingMore ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="h-1" /> // Invisible trigger
          )}
        </div>
      )}
    </div>
  );
});

VirtualizedDeckGrid.displayName = 'VirtualizedDeckGrid';

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'slides';

interface VirtualizedPopupDeckGridProps {
  decks: CompleteDeckData[] | any;
  onEdit: (deck: CompleteDeckData) => void;
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void;
  onBulkDelete?: (deckIds: string[]) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

// Virtualized deck grid for the popup dialog with different layout and infinite scrolling
export const VirtualizedPopupDeckGrid = React.memo(({
  decks,
  onEdit,
  onShowDeleteDialog,
  onBulkDelete,
  onLoadMore,
  hasMore,
  isLoadingMore
}: VirtualizedPopupDeckGridProps) => {
  const isMobile = useIsMobile();
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];

  // Multi-select state
  const [selectedDecks, setSelectedDecks] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Sorting state
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // Sort decks based on current option
  const sortedDecks = useMemo(() => {
    const sorted = [...safeDecks];
    switch (sortOption) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());
      case 'name-asc':
        return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name-desc':
        return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'slides':
        return sorted.sort((a, b) => (b.slides?.length || 0) - (a.slides?.length || 0));
      default:
        return sorted;
    }
  }, [safeDecks, sortOption]);

  const [visibleDecks, setVisibleDecks] = useState<Set<number>>(() => {
    // On iOS, start empty and let throttled queue handle visibility one at a time
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(12, safeDecks.length) }, (_, i) => i));
  });
  // Progressive upgrade for popup thumbnails on mobile too
  const [upgradedDecks, setUpgradedDecks] = useState<Set<number>>(() => new Set());
  const [upgradingIndex, setUpgradingIndex] = useState<number | null>(null);
  const upgradeQueueRef = useRef<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // Store observer reference so we can observe new elements as they mount
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedElementsRef = useRef<Set<HTMLDivElement>>(new Set());
  // Queue for throttled visibility on iOS
  const visibilityQueueRef = useRef<number[]>([]);
  const isProcessingVisibilityQueueRef = useRef(false);

  // Exit select mode when no decks selected
  useEffect(() => {
    if (selectedDecks.size === 0 && isSelectMode) {
      // Keep select mode if user explicitly enabled it
    }
  }, [selectedDecks.size, isSelectMode]);

  // Toggle deck selection
  const toggleDeckSelection = useCallback((deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDecks(prev => {
      const next = new Set(prev);
      if (next.has(deckId)) {
        next.delete(deckId);
      } else {
        next.add(deckId);
      }
      return next;
    });
    if (!isSelectMode) setIsSelectMode(true);
  }, [isSelectMode]);

  // Select all / deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedDecks.size === sortedDecks.length) {
      setSelectedDecks(new Set());
    } else {
      setSelectedDecks(new Set(sortedDecks.map(d => d.uuid || '')));
    }
  }, [selectedDecks.size, sortedDecks]);

  // Cancel selection mode
  const cancelSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedDecks(new Set());
  }, []);

  // Handle bulk delete
  const handleBulkDelete = useCallback(() => {
    if (onBulkDelete && selectedDecks.size > 0) {
      onBulkDelete(Array.from(selectedDecks));
      setSelectedDecks(new Set());
      setIsSelectMode(false);
    }
  }, [onBulkDelete, selectedDecks]);

  // Sort label for dropdown
  const sortLabels: Record<SortOption, string> = {
    'newest': 'Newest first',
    'oldest': 'Oldest first',
    'name-asc': 'Name (A-Z)',
    'name-desc': 'Name (Z-A)',
    'slides': 'Most slides',
  };

  // Process visibility queue one item at a time on iOS to prevent crashes
  const processVisibilityQueue = useCallback(() => {
    if (!BROWSER.isMobile || visibilityQueueRef.current.length === 0) {
      isProcessingVisibilityQueueRef.current = false;
      return;
    }

    isProcessingVisibilityQueueRef.current = true;
    const nextIndex = visibilityQueueRef.current.shift();
    if (nextIndex !== undefined) {
      setVisibleDecks((prev) => new Set(prev).add(nextIndex));
    }

    // Process next item after delay - iOS needs more time between renders
    setTimeout(processVisibilityQueue, 300);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          if (entry.isIntersecting) {
            // On iOS, queue items for throttled visibility to prevent crash
            if (BROWSER.isMobile) {
              setVisibleDecks((prev) => {
                if (prev.has(index)) return prev;
                // Queue for throttled processing
                if (!visibilityQueueRef.current.includes(index)) {
                  visibilityQueueRef.current.push(index);
                  if (!isProcessingVisibilityQueueRef.current) {
                    setTimeout(processVisibilityQueue, 50);
                  }
                }
                return prev;
              });
            } else {
              // Desktop: update immediately
              setVisibleDecks((prev) => new Set(prev).add(index));
            }
          } else {
            // Always remove immediately when scrolling away (frees memory)
            setVisibleDecks((prev) => {
              const next = new Set(prev);
              next.delete(index);
              return next;
            });
            // Also remove from queue if pending
            visibilityQueueRef.current = visibilityQueueRef.current.filter(i => i !== index);
          }
        });
      },
      {
        root: null,
        rootMargin: '50px',
        threshold: 0
      }
    );

    // Observe any elements that were already mounted
    itemRefs.current.forEach((element) => {
      if (!observedElementsRef.current.has(element)) {
        observerRef.current?.observe(element);
        observedElementsRef.current.add(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedElementsRef.current.clear();
      visibilityQueueRef.current = [];
    };
  }, [processVisibilityQueue]);

  // Re-observe when deck count changes (new decks loaded)
  useEffect(() => {
    if (!observerRef.current) return;

    // Small delay to ensure new elements have their refs set
    const timer = setTimeout(() => {
      itemRefs.current.forEach((element) => {
        if (!observedElementsRef.current.has(element)) {
          observerRef.current?.observe(element);
          observedElementsRef.current.add(element);
        }
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [safeDecks.length]);

  // Queue management: Enqueue visible items that need upgrade + downgrade non-visible
  useEffect(() => {
    // Progressive upgrade only needed on iOS/mobile
    if (!BROWSER.isMobile && !isMobile) return;

    // 1. Clean up upgradedDecks: downgrade items that are no longer visible to save memory (iframe limit)
    setUpgradedDecks(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const idx of next) {
        if (!visibleDecks.has(idx)) {
          next.delete(idx);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // 2. Enqueue visible items not yet upgraded
    visibleDecks.forEach((idx) => {
      if (upgradedDecks.has(idx)) return;
      if (upgradeQueueRef.current.includes(idx)) return;
      if (upgradingIndex === idx) return;
      upgradeQueueRef.current.push(idx);
    });

    // Kick processing loop
    if (upgradingIndex === null && upgradeQueueRef.current.length > 0) {
      // Find the next VISIBLE item in the queue
      let next = upgradeQueueRef.current.shift();
      while (next !== undefined && !visibleDecks.has(next)) {
        next = upgradeQueueRef.current.shift();
      }

      if (next !== undefined) {
        setUpgradingIndex(next);
      }
    }
  }, [isMobile, visibleDecks, upgradedDecks, upgradingIndex]);

  useEffect(() => {
    // Progressive upgrade only needed on iOS/mobile
    if (!BROWSER.isMobile && !isMobile) return;
    if (upgradingIndex === null) return;
    // iOS needs more time between upgrades to prevent crashes
    const t = window.setTimeout(() => {
      setUpgradedDecks((prev) => {
        const next = new Set(prev);
        next.add(upgradingIndex);
        return next;
      });
      setUpgradingIndex(null);
    }, BROWSER.isMobile ? 500 : 50);
    return () => window.clearTimeout(t);
  }, [isMobile, upgradingIndex]);

  // Set up infinite scroll observer
  useEffect(() => {
    // Find the scrollable container (the dialog content's scrollable area)
    const findScrollContainer = () => {
      let element = containerRef.current?.parentElement;
      while (element && element !== document.body) {
        const style = window.getComputedStyle(element);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          return element;
        }
        element = element.parentElement;
      }
      return null;
    };

    scrollContainerRef.current = findScrollContainer();

    if (!scrollContainerRef.current || !loadMoreTriggerRef.current || !hasMore) return;

    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px',
        threshold: 0
      }
    );

    scrollObserver.observe(loadMoreTriggerRef.current);

    return () => {
      scrollObserver.disconnect();
    };
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <div ref={containerRef} className="flex flex-col w-full">
      {/* Toolbar with sort and multi-select controls */}
      <div className="flex items-center justify-between gap-3 pb-4 mb-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          {isSelectMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelSelectMode}
                className="h-8 px-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="h-8 px-2 text-zinc-600 dark:text-zinc-300"
              >
                {selectedDecks.size === sortedDecks.length ? 'Deselect all' : 'Select all'}
              </Button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">
                {selectedDecks.size} selected
              </span>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSelectMode(true)}
              className="h-8 px-3 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Select
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk delete button */}
          {isSelectMode && selectedDecks.size > 0 && onBulkDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBulkDelete}
              className="h-8 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete ({selectedDecks.size})
            </Button>
          )}

          {/* Sort select - native for dialog compatibility */}
          <div className="relative flex items-center">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-zinc-400 pointer-events-none" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="h-8 pl-1 pr-6 text-sm bg-transparent text-zinc-600 dark:text-zinc-300 border-none outline-none cursor-pointer appearance-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
            >
              {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                <option key={option} value={option}>
                  {sortLabels[option]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid layout with thumbnails on desktop, list on mobile */}
      {!isMobile ? (
        // Desktop: Grid with thumbnails
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedDecks.map((deck, index) => {
            const isSelected = selectedDecks.has(deck.uuid || '');
            const shouldRender = visibleDecks.has(index);

            return (
              <div
                key={deck.uuid}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el);
                }}
                data-index={index}
                className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-zinc-900'
                    : 'hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600'
                }`}
                onClick={(e) => {
                  if (isSelectMode) {
                    toggleDeckSelection(deck.uuid || '', e);
                  } else {
                    onEdit(deck);
                  }
                }}
              >
                {/* Thumbnail with text overlay */}
                <div className="aspect-[16/9] bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
                  <div className="absolute inset-0 w-full h-full">
                    {shouldRender ? (
                      <DeckThumbnail deck={deck} renderMode="full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="animate-pulse w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                      </div>
                    )}
                  </div>

                  {/* Text overlay at bottom - like DeckCard */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-6 pb-2 px-3">
                    <h3 className="text-sm font-bold text-white truncate">
                      {deck.name || 'Untitled presentation'}
                    </h3>
                    <p className="text-xs text-white/70 mt-0.5">
                      {formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })}
                      {deck.slides?.length ? ` · ${deck.slides.length} slides` : ''}
                    </p>
                  </div>

                  {/* Selection checkbox overlay */}
                  {isSelectMode && (
                    <div
                      className={`absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-orange-500 border-orange-500'
                          : 'bg-white/80 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  )}

                  {/* Delete button (only when not in select mode) */}
                  {!isSelectMode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-zinc-800/80 hover:bg-red-50 dark:hover:bg-red-900/50 text-zinc-500 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (deck.uuid) {
                          onShowDeleteDialog(deck.uuid, e);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Mobile: Simple list
        <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {sortedDecks.map((deck, index) => {
            const isSelected = selectedDecks.has(deck.uuid || '');

            return (
              <div
                key={deck.uuid}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el);
                }}
                data-index={index}
                className={`group flex items-center gap-3 py-3 px-2 cursor-pointer transition-colors rounded-lg ${
                  isSelected ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
                onClick={(e) => {
                  if (isSelectMode) {
                    toggleDeckSelection(deck.uuid || '', e);
                  } else {
                    onEdit(deck);
                  }
                }}
              >
                {/* Checkbox for select mode */}
                {isSelectMode && (
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-orange-500 border-orange-500'
                        : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {deck.name || 'Untitled presentation'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })}
                    {deck.slides?.length ? ` · ${deck.slides.length} slides` : ''}
                  </p>
                </div>

                {!isSelectMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowDeleteDialog(deck.uuid || '', e);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreTriggerRef} className="py-4">
          {isLoadingMore ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
            </div>
          ) : (
            <div className="h-1" />
          )}
        </div>
      )}
    </div>
  );
});

VirtualizedPopupDeckGrid.displayName = 'VirtualizedPopupDeckGrid';
