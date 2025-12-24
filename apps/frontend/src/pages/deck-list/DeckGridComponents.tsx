/**
 * Extracted components from DeckList.tsx for better code organization.
 * Contains: RotatingWords, VirtualizedDeckGrid, VirtualizedPopupDeckGrid
 */

import React, { useState, useRef, useEffect } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import DeckCard from '@/components/deck/DeckCard';
import DeckThumbnail from '@/components/deck/DeckThumbnail';
import { formatDistanceToNow } from 'date-fns';

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
      className="text-orange-500 inline-block overflow-hidden transition-[width] duration-300"
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
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];
  const [renderedDecks, setRenderedDecks] = useState<Set<number>>(() => {
    // Start with first few decks rendered to prevent flash
    return new Set(Array.from({ length: Math.min(6, safeDecks.length) }, (_, i) => i));
  });
  const [initiallyVisibleDecks, setInitiallyVisibleDecks] = useState<Set<number>>(() => {
    // Start with first few decks visible to prevent flash
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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          if (entry.isIntersecting) {
            // Once visible, always rendered
            setRenderedDecks((prev) => new Set(prev).add(index));
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Load items 100px before they become visible
        threshold: 0
      }
    );

    // Observe all deck placeholders
    itemRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
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
              />
            ) : (
              <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
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
  const safeDecks: CompleteDeckData[] = Array.isArray(decks) ? decks : [];
  const [visibleDecks, setVisibleDecks] = useState<Set<number>>(() => {
    // Start with all decks visible to prevent flash on initial load
    return new Set(Array.from({ length: safeDecks.length }, (_, i) => i));
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          setVisibleDecks((prev) => {
            const next = new Set(prev);
            if (entry.isIntersecting) {
              next.add(index);
            } else {
              next.delete(index);
            }
            return next;
          });
        });
      },
      {
        root: null,
        rootMargin: '50px',
        threshold: 0
      }
    );

    itemRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [safeDecks.length]);

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
    <div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
      {safeDecks.map((deck, index) => (
        <div
          key={deck.uuid}
          ref={(el) => {
            if (el) itemRefs.current.set(index, el);
          }}
          data-index={index}
        >
          {visibleDecks.has(index) ? (
            <div
              className="group relative cursor-pointer ring-1 ring-zinc-200 dark:ring-zinc-700 hover:shadow-md dark:hover:shadow-black/40 transition-all duration-300 rounded-lg overflow-hidden"
              onClick={() => onEdit(deck)}
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                  <DeckThumbnail deck={deck} />
                </div>
                {/* Text overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-6 pb-2 px-3">
                  <h3 className="text-xs font-bold text-white truncate" title={deck.name || 'Untitled presentation'}>
                    {deck.name || 'Untitled presentation'}
                  </h3>
                  <span className="text-[10px] text-white/70 whitespace-nowrap">
                    Updated {formatDistanceToNow(new Date(deck.lastModified), { addSuffix: true })}
                  </span>
                </div>
                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowDeleteDialog(deck.uuid || '', e);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <div className="aspect-[16/9] bg-zinc-200 dark:bg-zinc-800"></div>
            </div>
          )}
        </div>
      ))}

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreTriggerRef} className="col-span-full py-4">
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

VirtualizedPopupDeckGrid.displayName = 'VirtualizedPopupDeckGrid';
