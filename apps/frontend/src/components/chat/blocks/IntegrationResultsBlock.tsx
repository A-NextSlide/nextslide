/**
 * IntegrationResultsBlock Component
 *
 * A generic, reusable block for displaying integration search results in chat.
 * Works with any integration (LinkedIn, Salesforce, HubSpot, etc.)
 *
 * Features:
 * - Horizontal scrollable carousel
 * - Configurable card rendering via render prop
 * - Loading and empty states
 * - Selection support
 * - Keyboard navigation
 */

import React, { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Loader2, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntegrationIcon, getIntegrationColor } from '@/components/integrations/IntegrationIcon';

export interface IntegrationResult {
  id: string;
  [key: string]: any;
}

export interface IntegrationResultsBlockProps<T extends IntegrationResult> {
  // Integration info
  integrationId: string;
  integrationName: string;
  query: string;

  // Results data
  results: T[];
  isLoading?: boolean;
  error?: string;

  // Selection
  selectedId?: string;
  onSelect?: (result: T) => void;
  onSkip?: () => void;  // Skip selection and continue

  // Card rendering - use this to customize how each result is displayed
  renderCard: (result: T, isSelected: boolean, onSelect: () => void) => React.ReactNode;

  // Optional customization
  emptyMessage?: string;
  cardWidth?: number;
  maxHeight?: number;
  className?: string;
}

export function IntegrationResultsBlock<T extends IntegrationResult>({
  integrationId,
  integrationName,
  query,
  results,
  isLoading = false,
  error,
  selectedId,
  onSelect,
  onSkip,
  renderCard,
  emptyMessage,
  cardWidth = 240,
  maxHeight = 320,
  className,
}: IntegrationResultsBlockProps<T>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const brandColor = getIntegrationColor(integrationId);

  // Check scroll state
  const checkScrollState = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  };

  useEffect(() => {
    checkScrollState();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollState);
      window.addEventListener('resize', checkScrollState);
      return () => {
        container.removeEventListener('scroll', checkScrollState);
        window.removeEventListener('resize', checkScrollState);
      };
    }
  }, [results]);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = cardWidth + 12; // Card width + gap
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('rounded-xl border bg-card p-6', className)}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse"
            style={{ backgroundColor: brandColor ? `${brandColor}20` : 'hsl(var(--muted))' }}
          >
            <IntegrationIcon integrationId={integrationId} size="md" variant="colored" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Searching {integrationName} for "{query}"...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-xl border bg-card p-6', className)}>
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (results.length === 0) {
    return (
      <div className={cn('rounded-xl border bg-card p-6', className)}>
        <div className="flex flex-col items-center gap-2 text-center py-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
            style={{ backgroundColor: brandColor ? `${brandColor}15` : 'hsl(var(--muted))' }}
          >
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {emptyMessage || `No results found for "${query}"`}
          </p>
          <p className="text-xs text-muted-foreground/70">
            Try a different search term or add more details
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('rounded-xl border bg-card overflow-hidden', className)}
      style={{ maxHeight }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: brandColor ? `${brandColor}08` : 'hsl(var(--muted)/0.3)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: brandColor ? `${brandColor}20` : 'hsl(var(--muted))' }}
          >
            <IntegrationIcon integrationId={integrationId} size="md" variant="colored" />
          </div>
          <div>
            <span className="text-sm font-medium">
              {integrationName} Results
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {results.length} found for "{query}"
            </span>
          </div>
        </div>

        {/* Scroll controls */}
        {results.length > 2 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable results */}
      <div className="relative">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none" />
        )}

        {/* Cards container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-3 overflow-x-auto p-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {results.map((result, index) => (
            <div
              key={result.id}
              className="flex-shrink-0 relative"
              style={{ width: cardWidth, scrollSnapAlign: 'start' }}
            >
              {renderCard(
                result,
                selectedId === result.id,
                () => onSelect?.(result)
              )}
              {/* Best match badge for first result */}
              {index === 0 && results.length > 1 && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: brandColor || 'hsl(var(--primary))' }}
                  >
                    Best match
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />
        )}
      </div>

      {/* Selection hint with Skip option */}
      {!selectedId && onSelect && (
        <div className="px-4 pb-3 text-center border-t pt-2 flex items-center justify-center gap-3">
          <p className="text-xs text-muted-foreground">
            Select a profile to continue
          </p>
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default IntegrationResultsBlock;
