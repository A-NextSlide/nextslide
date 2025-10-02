import { useState, useCallback, useRef } from 'react';
import { deckSyncService } from '@/lib/deckSyncService';
import { CompleteDeckData } from '@/types/DeckTypes';
import { useToast } from '@/hooks/use-toast';

export interface UsePopupDeckPaginationReturn {
  popupDecks: CompleteDeckData[];
  isLoadingPopup: boolean;
  isLoadingMorePopup: boolean;
  hasMorePopup: boolean;
  hasLoadedInitialPopup: boolean;
  loadPopupDecks: () => Promise<void>;
  loadMorePopupDecks: () => Promise<void>;
  resetPopupDecks: () => void;
}

export const usePopupDeckPagination = (): UsePopupDeckPaginationReturn => {
  const [popupDecks, setPopupDecks] = useState<CompleteDeckData[]>([]);
  const [isLoadingPopup, setIsLoadingPopup] = useState(false);
  const [isLoadingMorePopup, setIsLoadingMorePopup] = useState(false);
  const [hasMorePopup, setHasMorePopup] = useState(true);
  const [currentOffsetPopup, setCurrentOffsetPopup] = useState(0);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  
  // Guard to prevent duplicate loadMore calls
  const isLoadingMoreRef = useRef(false);
  
  const { toast } = useToast();

  const loadPopupDecks = useCallback(async () => {
    try {
      setIsLoadingPopup(true);
      console.log('[usePopupDeckPagination] Loading initial popup decks...');
      const result = await deckSyncService.getAllDecks(20, 0);
      console.log('[usePopupDeckPagination] Loaded popup decks:', result.decks.length);
      setPopupDecks(result.decks);
      setHasMorePopup(result.has_more);
      setCurrentOffsetPopup(result.decks.length);
      setHasLoadedInitial(true);
    } catch (err) {
      console.error('Error loading popup decks:', err);
      toast({
        title: "Error loading presentations",
        description: "Failed to load presentations. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingPopup(false);
    }
  }, [toast]);

  const loadMorePopupDecks = useCallback(async () => {
    // Prevent duplicate calls
    if (isLoadingMoreRef.current || !hasMorePopup || !hasLoadedInitial) return;
    
    try {
      isLoadingMoreRef.current = true;
      setIsLoadingMorePopup(true);
      console.log('[usePopupDeckPagination] Loading more popup decks from offset:', currentOffsetPopup);
      const result = await deckSyncService.getAllDecks(20, currentOffsetPopup);
      console.log('[usePopupDeckPagination] Loaded more popup decks:', result.decks.length);
      
      if (result.decks.length > 0) {
        setPopupDecks(prev => [...prev, ...result.decks]);
        setCurrentOffsetPopup(prev => prev + result.decks.length);
        setHasMorePopup(result.has_more);
      } else {
        setHasMorePopup(false);
      }
    } catch (err) {
      console.error('Error loading more popup decks:', err);
      toast({
        title: "Error loading more presentations",
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingMorePopup(false);
      isLoadingMoreRef.current = false;
    }
  }, [currentOffsetPopup, hasMorePopup, hasLoadedInitial, toast]);

  const resetPopupDecks = useCallback(() => {
    setPopupDecks([]);
    setCurrentOffsetPopup(0);
    setHasMorePopup(true);
    setHasLoadedInitial(false);
    isLoadingMoreRef.current = false;
  }, []);

  return {
    popupDecks,
    isLoadingPopup,
    isLoadingMorePopup,
    hasMorePopup,
    hasLoadedInitialPopup: hasLoadedInitial,
    loadPopupDecks,
    loadMorePopupDecks,
    resetPopupDecks
  };
};