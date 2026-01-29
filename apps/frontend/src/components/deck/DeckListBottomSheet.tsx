/**
 * Mobile-optimized bottom sheet for browsing decks.
 * Features a peek bar that expands into a full deck list view.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { cn } from '@/lib/utils';
import { Search, X, ChevronUp, FolderOpen, Loader2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DeckCard from './DeckCard';
import { formatDistanceToNow } from 'date-fns';

interface DeckListBottomSheetProps {
  decks: CompleteDeckData[];
  totalCount: number; // Total number of decks from API (not just loaded)
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEdit: (deck: CompleteDeckData) => void;
  onShowDeleteDialog: (deckId: string, event: React.MouseEvent) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isSearching: boolean;
  onClearSearch: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasApiKeys?: boolean;
  onCreateNew?: () => void;
}

const DeckListBottomSheet: React.FC<DeckListBottomSheetProps> = ({
  decks,
  totalCount,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onEdit,
  onShowDeleteDialog,
  searchQuery,
  onSearchChange,
  isSearching,
  onClearSearch,
  activeTab,
  onTabChange,
  hasApiKeys = false,
  onCreateNew,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [currentHeight, setCurrentHeight] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // DeckThumbnail handles mobile stamp-based rendering internally

  // Heights
  const PEEK_HEIGHT = 72; // Collapsed height showing peek bar
  const MAX_HEIGHT_PERCENT = 85; // Maximum expanded height as percentage of viewport

  // Handle drag to expand/collapse
  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStartY(clientY);
    setCurrentHeight(sheetRef.current?.offsetHeight || PEEK_HEIGHT);
  }, []);

  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging) return;

    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = dragStartY - clientY;
    const viewportHeight = window.innerHeight;
    const maxHeight = viewportHeight * (MAX_HEIGHT_PERCENT / 100);

    let newHeight = currentHeight + deltaY;
    newHeight = Math.max(PEEK_HEIGHT, Math.min(maxHeight, newHeight));

    if (sheetRef.current) {
      sheetRef.current.style.height = `${newHeight}px`;
    }
  }, [isDragging, dragStartY, currentHeight]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const currentSheetHeight = sheetRef.current?.offsetHeight || PEEK_HEIGHT;
    const viewportHeight = window.innerHeight;
    const threshold = viewportHeight * 0.3;

    // Snap to expanded or collapsed based on threshold
    if (currentSheetHeight > threshold) {
      setIsExpanded(true);
      if (sheetRef.current) {
        sheetRef.current.style.height = `${MAX_HEIGHT_PERCENT}vh`;
      }
    } else {
      setIsExpanded(false);
      if (sheetRef.current) {
        sheetRef.current.style.height = `${PEEK_HEIGHT}px`;
      }
    }
  }, [isDragging]);

  // Add global listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
      window.addEventListener('mouseup', handleDragEnd);
    }

    return () => {
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Toggle expanded state
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    if (!isExpanded || !loadMoreTriggerRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: contentRef.current,
        rootMargin: '200px',
        threshold: 0,
      }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => observer.disconnect();
  }, [isExpanded, hasMore, isLoadingMore, onLoadMore]);

  // Get recent decks for peek preview (first 3)
  const recentDecks = decks.slice(0, 3);
  // Use actual total count from API, fallback to loaded count
  const displayCount = totalCount > 0 ? totalCount : decks.length;

  return (
    <div
      ref={sheetRef}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 shadow-2xl shadow-black/20",
        "rounded-t-3xl transition-[height] duration-300 ease-out overflow-hidden",
        isDragging && "transition-none"
      )}
      style={{ height: isExpanded ? `${MAX_HEIGHT_PERCENT}vh` : `${PEEK_HEIGHT}px` }}
    >
      {/* Orange gradient top accent - matches rounded corners */}
      <div className="h-1.5 bg-gradient-to-r from-[#FF6B00] via-[#FF8533] to-[#FF6B00] rounded-t-3xl shrink-0 mx-0" />

      {/* Drag handle */}
      <div
        className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleDragStart}
        onMouseDown={handleDragStart}
      >
        <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
      </div>

      {/* Peek Bar (collapsed view) */}
      {!isExpanded && (
        <div
          className="px-4 pb-3 cursor-pointer"
          onClick={toggleExpanded}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/25">
                <FolderOpen className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  {displayCount > 0 ? `${displayCount} Presentation${displayCount !== 1 ? 's' : ''}` : 'My Presentations'}
                </p>
                {recentDecks.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {recentDecks[0].name || 'Untitled'} {recentDecks.length > 1 && `+${recentDecks.length - 1} more`}
                  </p>
                )}
              </div>
            </div>
            <ChevronUp className="h-5 w-5 text-zinc-400 dark:text-zinc-500 shrink-0" />
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="flex flex-col h-[calc(100%-28px)] overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-1 pb-3 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/25">
                  <FolderOpen className="h-5 w-5 text-white" />
                </div>
                <h2
                  className="text-xl font-extrabold text-zinc-900 dark:text-white"
                  style={{ fontFamily: '"HK Grotesk", sans-serif', letterSpacing: '-0.02em' }}
                >
                  My Presentations
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  onClick={toggleExpanded}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search presentations..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border-0 pl-10 pr-8 h-10 rounded-xl text-sm"
              />
              {isSearching ? (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 animate-spin" />
              ) : searchQuery ? (
                <button
                  onClick={() => {
                    onClearSearch();
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
              <TabsList className={cn(
                "w-full bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl grid h-auto",
                hasApiKeys ? "grid-cols-3" : "grid-cols-2"
              )}>
                <TabsTrigger
                  value="by-me"
                  className="rounded-lg text-xs font-medium py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm"
                >
                  My Decks
                </TabsTrigger>
                <TabsTrigger
                  value="shared"
                  className="rounded-lg text-xs font-medium py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm"
                >
                  Shared
                </TabsTrigger>
                {hasApiKeys && (
                  <TabsTrigger
                    value="api"
                    className="rounded-lg text-xs font-medium py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-700 data-[state=active]:shadow-sm"
                  >
                    API
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          </div>

          {/* Deck Grid */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto px-4 pb-6 overscroll-contain"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            ) : decks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
                  <FolderOpen className="h-8 w-8 text-zinc-400" />
                </div>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  {searchQuery ? 'No matches found' : 'No presentations yet'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mb-4">
                  {searchQuery ? 'Try a different search term' : 'Create your first presentation above'}
                </p>
                {!searchQuery && onCreateNew && (
                  <Button
                    onClick={() => {
                      setIsExpanded(false);
                      if (sheetRef.current) {
                        sheetRef.current.style.height = `${PEEK_HEIGHT}px`;
                      }
                      onCreateNew();
                    }}
                    className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create New
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {decks.map((deck, index) => (
                  <DeckCard
                    key={deck.uuid}
                    deck={deck}
                    onEdit={onEdit}
                    onShowDeleteDialog={onShowDeleteDialog}
                    index={index}
                    shouldAnimate={false}
                    thumbnailRenderMode="full"
                  />
                ))}

                {/* Load more trigger */}
                {hasMore && (
                  <div ref={loadMoreTriggerRef} className="py-4">
                    {isLoadingMore ? (
                      <div className="flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                      </div>
                    ) : (
                      <div className="h-1" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeckListBottomSheet;
