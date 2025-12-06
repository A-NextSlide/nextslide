import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { deckSyncService } from '@/lib/deckSyncService';

export interface UseDeckFilteringReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredDecks: CompleteDeckData[];
  isSearching: boolean;
  searchResults: CompleteDeckData[] | null;
  clearSearch: () => void;
}

export const useDeckFiltering = (decks: CompleteDeckData[]): UseDeckFilteringReturn => {
  const [searchQuery, setSearchQueryState] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CompleteDeckData[] | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced server-side search
  const performSearch = useCallback(async (query: string) => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    abortControllerRef.current = new AbortController();

    try {
      // Fetch search results from server (search all user's decks)
      const result = await deckSyncService.getAllDecks(50, 0, 'owned', query.trim());
      setSearchResults(result.decks);
    } catch (err) {
      // Don't log abort errors
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[useDeckFiltering] Search error:', err);
      }
      // On error, fall back to local filtering
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Handle search query changes with debouncing
  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If query is empty, clear results immediately
    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    // Debounce the search
    debounceTimerRef.current = setTimeout(() => {
      performSearch(query);
    }, 300); // 300ms debounce
  }, [performSearch]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQueryState('');
    setSearchResults(null);
    setIsSearching(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Use search results if available, otherwise filter locally for immediate feedback
  const filteredDecks = useMemo(() => {
    // If we have server search results, use them
    if (searchResults !== null) {
      return searchResults;
    }

    // Otherwise filter locally (for immediate feedback while typing)
    if (!searchQuery.trim()) {
      return decks;
    }

    const lowercasedQuery = searchQuery.toLowerCase();
    return decks.filter(deck =>
      (deck.name || '').toLowerCase().includes(lowercasedQuery)
    );
  }, [searchQuery, decks, searchResults]);

  return {
    searchQuery,
    setSearchQuery,
    filteredDecks,
    isSearching,
    searchResults,
    clearSearch,
  };
};
