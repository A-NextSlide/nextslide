/**
 * Extracted components from DeckList.tsx for better code organization.
 * Contains: RotatingWords, VirtualizedDeckGrid, VirtualizedPopupDeckGrid
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
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

  // Simplified mobile rendering: use refs to avoid dependency loops
  // Only ONE item renders at a time on mobile
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const thumbnailRefsMapRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Queue management - all refs to avoid dependency loops
  const renderQueueRef = useRef<number[]>([]);
  const activeRenderIndexRef = useRef<number | null>(null);
  const visibleDecksRef = useRef<Set<number>>(new Set());
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State only for triggering re-renders
  const [renderedDecks, setRenderedDecks] = useState<Set<number>>(() => {
    // On mobile, start empty; on desktop, render first few
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const [, forceUpdate] = useState(0);

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

  // Process render queue - ONE item at a time
  const processRenderQueue = useCallback(() => {
    if (!BROWSER.isMobile) return;

    // Pause during scroll
    if (isScrollingRef.current) {
      setTimeout(processRenderQueue, 200);
      return;
    }

    // If currently rendering one, check if it's cached now
    if (activeRenderIndexRef.current !== null) {
      const deck = safeDecksRef.current[activeRenderIndexRef.current];
      if (deck?.uuid && hasCachedThumbnailRef.current(deck.uuid)) {
        console.log(`[DeckGrid] ✅ Cached: #${activeRenderIndexRef.current}`);
        activeRenderIndexRef.current = null;
      } else {
        // Still rendering, don't start another
        return;
      }
    }

    // Clean queue - remove cached and non-visible items
    renderQueueRef.current = renderQueueRef.current.filter(index => {
      const deck = safeDecksRef.current[index];
      if (!deck?.uuid) return false;
      if (hasCachedThumbnailRef.current(deck.uuid)) return false;
      if (!visibleDecksRef.current.has(index)) return false;
      return true;
    });

    if (renderQueueRef.current.length === 0) return;

    // Get next item
    const nextIndex = renderQueueRef.current[0];
    if (nextIndex !== undefined) {
      console.log(`[DeckGrid] 🎬 Rendering: #${nextIndex}, queue: ${renderQueueRef.current.length}`);
      activeRenderIndexRef.current = nextIndex;
      setRenderedDecks(prev => new Set(prev).add(nextIndex));
      forceUpdate(v => v + 1);
    }
  }, []); // No dependencies - uses refs

  // When cache changes, process next in queue
  useEffect(() => {
    if (BROWSER.isMobile) {
      const timer = setTimeout(processRenderQueue, 150);
      return () => clearTimeout(timer);
    }
  }, [cacheVersion, processRenderQueue]);

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

  // Track scrolling to pause rendering
  useEffect(() => {
    if (!BROWSER.isMobile) return;
    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        // Resume processing after scroll
        processRenderQueue();
      }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [processRenderQueue]);

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

            if (BROWSER.isMobile) {
              // Queue for rendering if not cached and not already queued
              const deck = safeDecksRef.current[index];
              if (deck?.uuid && !hasCachedThumbnailRef.current(deck.uuid)) {
                if (!renderQueueRef.current.includes(index) && activeRenderIndexRef.current !== index) {
                  renderQueueRef.current.push(index);
                  setTimeout(processRenderQueue, 50);
                }
              }
            } else {
              // Desktop: render immediately
              setRenderedDecks(prev => new Set(prev).add(index));
            }
          } else {
            visibleDecksRef.current.delete(index);

            if (BROWSER.isMobile) {
              // Remove from queue
              renderQueueRef.current = renderQueueRef.current.filter(i => i !== index);

              // Capture screenshot before "unloading" if rendered
              const deck = safeDecksRef.current[index];
              if (deck?.uuid) {
                const thumbnailEl = thumbnailRefsMapRef.current.get(deck.uuid);
                if (thumbnailEl && !hasCachedThumbnailRef.current(deck.uuid)) {
                  console.log(`[DeckGrid] 📸 Capture on exit: #${index}`);
                  captureThumbnailRef.current(deck.uuid, thumbnailEl);
                }
              }
            }
          }
        });
      },
      { root: null, rootMargin: '100px', threshold: 0 }
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
  }, [processRenderQueue]);

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

        // Check for cached thumbnail
        const cachedUrl = BROWSER.isMobile && deck.uuid ? getCachedThumbnail(deck.uuid) : null;

        // On mobile: show cached if available, otherwise check if this is the active render
        const isActiveRender = BROWSER.isMobile && activeRenderIndexRef.current === index;

        // Determine what to show:
        // - Desktop: always render full
        // - Mobile with cache: show cached image
        // - Mobile active render: show full DeckCard (so we can capture it)
        // - Mobile waiting: show placeholder
        const showDeckCard = !BROWSER.isMobile || isActiveRender || shouldRender;

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
                    // Capture after render if this is the active render and not yet cached
                    if (BROWSER.isMobile && isActiveRender && !hasCachedThumbnail(deck.uuid)) {
                      setTimeout(() => {
                        const element = thumbnailRefsMapRef.current.get(deck.uuid!);
                        if (element) {
                          captureThumbnail(deck.uuid!, element);
                        }
                      }, 400);
                    }
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

interface VirtualizedPopupDeckGridProps {
  decks: CompleteDeckData[] | any;
  onEdit: (deck: CompleteDeckData) => void;
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

// Virtualized deck grid for the popup dialog with different layout and infinite scrolling
export const VirtualizedPopupDeckGrid = React.memo(({
  decks,
  onEdit,
  onShowDeleteDialog,
  onLoadMore,
  hasMore,
  isLoadingMore
}: VirtualizedPopupDeckGridProps) => {
  const isMobile = useIsMobile();
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];
  const [visibleDecks, setVisibleDecks] = useState<Set<number>>(() => {
    // On iOS, start empty and let throttled queue handle visibility one at a time
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
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

  // Simple text list - no thumbnails for better iOS performance
  return (
    <div ref={containerRef} className="flex flex-col w-full divide-y divide-zinc-100 dark:divide-zinc-800">
      {safeDecks.map((deck, index) => (
        <div
          key={deck.uuid}
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
          }}
          data-index={index}
          className="group flex items-center justify-between py-3 px-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors rounded-lg"
          onClick={() => onEdit(deck)}
        >
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {deck.name || 'Untitled presentation'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })}
              {deck.slides?.length ? ` · ${deck.slides.length} slides` : ''}
            </p>
          </div>
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
        </div>
      ))}

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
