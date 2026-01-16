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
  const [renderedDecks, setRenderedDecks] = useState<Set<number>>(() => {
    // On iOS, start empty and let throttled queue handle rendering one at a time
    // On desktop, render first few immediately to prevent flash
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const [visibleDecks, setVisibleDecks] = useState<Set<number>>(() => new Set());
  // Progressive upgrade: on mobile, render full thumbnails one at a time to avoid crashes.
  const [upgradedDecks, setUpgradedDecks] = useState<Set<number>>(() => new Set());
  const [upgradingIndex, setUpgradingIndex] = useState<number | null>(null);
  const upgradeQueueRef = useRef<number[]>([]);
  const [initiallyVisibleDecks, setInitiallyVisibleDecks] = useState<Set<number>>(() => {
    // On iOS, don't pre-mark any as visible - let observer handle it
    if (BROWSER.isMobile) return new Set();
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const hasCheckedInitialVisibility = useRef(false);

  // Check initial visibility once when decks are loaded
  useEffect(() => {
    if (!hasCheckedInitialVisibility.current && decks.length > 0 && itemRefs.current.size > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const visibleIndexes = new Set<number>();

        // Find the scrollable container
        let scrollContainer = containerRef.current?.parentElement;
        while (scrollContainer && scrollContainer !== document.body) {
          const style = window.getComputedStyle(scrollContainer);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            break;
          }
          scrollContainer = scrollContainer.parentElement;
        }

        const containerRect = scrollContainer?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };

        // Check which cards are initially visible
        itemRefs.current.forEach((element, index) => {
          const rect = element.getBoundingClientRect();
          // Check if element is in viewport
          if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
            visibleIndexes.add(index);
          }
        });

        setInitiallyVisibleDecks(visibleIndexes);
        hasCheckedInitialVisibility.current = true;
      }, 100); // Small delay to ensure layout is complete
    }
  }, [safeDecks.length]);

  // Mobile browsers crash with too many iframes
  // Limit to 2 upgraded thumbnails at a time
  const MAX_UPGRADED_ON_MOBILE = 2;

  // Debug: Log mobile detection once
  const hasLoggedRef = useRef(false);
  if (!hasLoggedRef.current) {
    hasLoggedRef.current = true;
    console.log(`[DeckGrid] BROWSER.isMobile=${BROWSER.isMobile} isIOS=${BROWSER.isIOS} isChrome=${BROWSER.isChrome} isAndroid=${BROWSER.isAndroid}`);
  }

  useEffect(() => {
    // Progressive upgrade needed on iOS and mobile
    if (!BROWSER.isMobile && !isMobile) return;

    // 1. Clean up upgradedDecks: downgrade items that are no longer visible to save memory
    setUpgradedDecks(prev => {
      let changed = false;
      const next = new Set(prev);
      const removed: number[] = [];
      for (const idx of next) {
        if (!visibleDecks.has(idx)) {
          next.delete(idx);
          removed.push(idx);
          changed = true;
        }
      }
      if (BROWSER.isMobile && removed.length > 0) {
        console.log(`[Mobile] 💨 DOWNGRADE #${removed.join(',')} | upgraded=${next.size}`);
      }
      return changed ? next : prev;
    });

    // 2. Enqueue visible AND rendered items not yet upgraded
    visibleDecks.forEach((idx) => {
      if (!renderedDecks.has(idx)) return;
      if (upgradedDecks.has(idx)) return;
      if (upgradeQueueRef.current.includes(idx)) return;
      if (upgradingIndex === idx) return;
      upgradeQueueRef.current.push(idx);
    });

    // Kick processing loop - respect the max upgraded limit
    const currentUpgradedCount = upgradedDecks.size + (upgradingIndex !== null ? 1 : 0);
    const canUpgradeMore = !BROWSER.isMobile || currentUpgradedCount < MAX_UPGRADED_ON_MOBILE;

    if (upgradingIndex === null && upgradeQueueRef.current.length > 0 && canUpgradeMore) {
      let next = upgradeQueueRef.current.shift();
      while (next !== undefined && (!visibleDecks.has(next) || !renderedDecks.has(next))) {
        next = upgradeQueueRef.current.shift();
      }
      if (next !== undefined) {
        setUpgradingIndex(next);
      }
    }
  }, [isMobile, visibleDecks, upgradedDecks, upgradingIndex, renderedDecks]);

  // Ref for scroll state (defined earlier, used here for upgrade pausing)
  const isScrollingForUpgradeRef = useRef(false);

  useEffect(() => {
    // Progressive upgrade needed on iOS and mobile
    if (!BROWSER.isMobile && !isMobile) return;
    if (upgradingIndex === null) return;

    // Yield to the browser; then mark upgraded and proceed to the next.
    // iOS needs much more time between upgrades to prevent crashes
    const delay = BROWSER.isMobile ? 800 : 50;
    const t = window.setTimeout(() => {
      setUpgradedDecks((prev) => {
        const next = new Set(prev);
        next.add(upgradingIndex);
        if (BROWSER.isMobile) {
          console.log(`[Mobile] 🔥 UPGRADE #${upgradingIndex} | upgraded=${next.size}`);
        }
        return next;
      });
      setUpgradingIndex(null);
    }, delay);
    return () => window.clearTimeout(t);
  }, [isMobile, upgradingIndex]);

  // Store observer reference so we can observe new elements as they mount
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedElementsRef = useRef<Set<HTMLDivElement>>(new Set());
  // Queue for throttled rendering on iOS
  const renderQueueRef = useRef<number[]>([]);
  const isProcessingRenderQueueRef = useRef(false);
  // Ref to track currently visible items (for queue processing without state dependency)
  const visibleDecksRef = useRef<Set<number>>(new Set());
  // Track if user is actively scrolling (pause rendering during fast scroll)
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Delayed unload timers to prevent thrashing during scroll
  const unloadTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Process render queue one item at a time on iOS to prevent crashes
  const processRenderQueue = useCallback(() => {
    if (!BROWSER.isMobile || renderQueueRef.current.length === 0) {
      isProcessingRenderQueueRef.current = false;
      return;
    }

    // Pause rendering while user is actively scrolling
    if (isScrollingRef.current) {
      console.log(`[Mobile] ⏸️ PAUSED - scrolling, queue=${renderQueueRef.current.length}`);
      // Check again after scroll settles
      setTimeout(processRenderQueue, 200);
      return;
    }

    isProcessingRenderQueueRef.current = true;

    // Skip items that are no longer visible (user scrolled past them)
    let nextIndex = renderQueueRef.current.shift();
    let skipped = 0;
    while (nextIndex !== undefined && !visibleDecksRef.current.has(nextIndex)) {
      skipped++;
      nextIndex = renderQueueRef.current.shift();
    }
    if (skipped > 0) {
      console.log(`[Mobile] ⏭️ Skipped ${skipped} stale items`);
    }

    if (nextIndex !== undefined) {
      setRenderedDecks((prev) => {
        const next = new Set(prev).add(nextIndex);
        console.log(`[Mobile] ✅ RENDER #${nextIndex} | rendered=${next.size} visible=${visibleDecksRef.current.size} queue=${renderQueueRef.current.length}`);
        return next;
      });
    }

    // Process next item after delay - iOS needs more time between renders
    setTimeout(processRenderQueue, 300);
  }, []);

  // Track scrolling to pause rendering during fast scroll
  useEffect(() => {
    if (!BROWSER.isMobile) return;

    const handleScroll = () => {
      isScrollingRef.current = true;
      isScrollingForUpgradeRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      // Mark scroll as ended after 150ms of no scroll events
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        isScrollingForUpgradeRef.current = false;
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          if (entry.isIntersecting) {
            // Cancel any pending unload for this item
            const pendingUnload = unloadTimersRef.current.get(index);
            if (pendingUnload) {
              clearTimeout(pendingUnload);
              unloadTimersRef.current.delete(index);
            }

            // Update ref immediately (for queue processing)
            visibleDecksRef.current.add(index);

            // Track visibility for progressive mobile upgrade
            setVisibleDecks((prev) => {
              const next = new Set(prev);
              next.add(index);
              return next;
            });

            // On iOS, queue items for throttled rendering to prevent crash
            if (BROWSER.isMobile) {
              setRenderedDecks((prev) => {
                if (prev.has(index)) return prev;
                // Queue for throttled processing - limit queue size to prevent buildup
                if (!renderQueueRef.current.includes(index) && renderQueueRef.current.length < 10) {
                  renderQueueRef.current.push(index);
                  if (!isProcessingRenderQueueRef.current) {
                    setTimeout(processRenderQueue, 50);
                  }
                }
                return prev;
              });
            } else {
              // Desktop: render immediately
              setRenderedDecks((prev) => new Set(prev).add(index));
            }
          } else {
            // Update ref immediately (for queue processing)
            visibleDecksRef.current.delete(index);

            // Track when items leave viewport (for mobile memory management)
            setVisibleDecks((prev) => {
              const next = new Set(prev);
              next.delete(index);
              return next;
            });

            // On iOS: Delay unloading to prevent thrashing during scroll momentum
            if (BROWSER.isMobile) {
              // Remove from queues immediately
              renderQueueRef.current = renderQueueRef.current.filter(i => i !== index);
              upgradeQueueRef.current = upgradeQueueRef.current.filter(i => i !== index);

              // Delay actual unload by 500ms - if item becomes visible again, cancel
              const timer = setTimeout(() => {
                unloadTimersRef.current.delete(index);
                // Double-check still not visible before unloading
                if (!visibleDecksRef.current.has(index)) {
                  setRenderedDecks((prev) => {
                    if (!prev.has(index)) return prev;
                    const next = new Set(prev);
                    next.delete(index);
                    console.log(`[Mobile] ❌ UNLOAD #${index} | rendered=${next.size}`);
                    return next;
                  });
                }
              }, 500);
              unloadTimersRef.current.set(index, timer);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Load items 100px before they become visible
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
      renderQueueRef.current = [];
    };
  }, [processRenderQueue]);

  // Re-observe when deck count changes (new decks loaded via loadMore)
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

  // Set up infinite scroll observer
  useEffect(() => {
    // Find the scrollable container
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
    <div ref={containerRef} className="grid grid-cols-1 gap-3 auto-rows-max">
      {safeDecks.map((deck, index) => {
        // Only animate if this card was initially visible
        const shouldAnimate = initiallyVisibleDecks.has(index);
        const shouldRender = renderedDecks.has(index);
        // On iOS: use progressive upgrade (background -> full) with strict limits
        const thumbnailRenderMode: 'full' | 'background' =
          !BROWSER.isMobile ? 'full' : (upgradedDecks.has(index) ? 'full' : 'background');

        return (
          <div
            key={deck.uuid}
            ref={(el) => {
              if (el) itemRefs.current.set(index, el);
            }}
            data-index={index}
          >
            {shouldRender ? (
              <DeckCard
                deck={deck}
                onEdit={onEdit}
                onShowDeleteDialog={onShowDeleteDialog}
                index={index}
                shouldAnimate={shouldAnimate}
                thumbnailRenderMode={thumbnailRenderMode}
              />
            ) : (
              /* Placeholder with deck info - clickable to navigate immediately */
              <div
                className="relative aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg cursor-pointer ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden"
                onClick={() => onEdit(deck)}
              >
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
