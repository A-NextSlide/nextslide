import { useState, useEffect } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';

export interface UseDeckFilteringReturn {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredDecks: CompleteDeckData[];
}

export const useDeckFiltering = (decks: CompleteDeckData[]): UseDeckFilteringReturn => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredDecks, setFilteredDecks] = useState<CompleteDeckData[]>(decks);

  useEffect(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    const newFilteredDecks = decks.filter(deck =>
      (deck.name || '').toLowerCase().includes(lowercasedQuery)
    );
    setFilteredDecks(newFilteredDecks);
  }, [searchQuery, decks]);

  return {
    searchQuery,
    setSearchQuery,
    filteredDecks,
  };
}; 