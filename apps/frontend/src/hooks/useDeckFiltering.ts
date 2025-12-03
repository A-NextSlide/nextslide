import { useState, useMemo } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';

export interface UseDeckFilteringReturn {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredDecks: CompleteDeckData[];
}

export const useDeckFiltering = (decks: CompleteDeckData[]): UseDeckFilteringReturn => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return decks;
    const lowercasedQuery = searchQuery.toLowerCase();
    return decks.filter(deck =>
      (deck.name || '').toLowerCase().includes(lowercasedQuery)
    );
  }, [searchQuery, decks]);

  return {
    searchQuery,
    setSearchQuery,
    filteredDecks,
  };
}; 