import { useState, useEffect } from 'react';
import { CompleteDeckData } from '@/types/DeckTypes';
import { NarrativeFlow } from '@/types/SlideTypes';
import { useDeckStore } from '@/stores/deckStore';
import { deckSyncService } from '@/lib/deckSyncService';

interface UseDeckWithNarrativeFlowResult {
  deck: CompleteDeckData | null;
  narrativeFlow: NarrativeFlow | null;
  isLoading: boolean;
  isPollingForNarrative: boolean;
}

/**
 * Custom hook to get narrative flow from the deck store
 * No longer polls the API - uses the deck data from store
 */
export function useDeckWithNarrativeFlow(deckId: string | undefined): UseDeckWithNarrativeFlowResult {
  const deckData = useDeckStore(state => state.deckData);
  const [narrativeFlow, setNarrativeFlow] = useState<NarrativeFlow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPollingForNarrative, setIsPollingForNarrative] = useState(false);
  
  useEffect(() => {
    let isCancelled = false;

    // Helper to safely set state
    const safeSetNarrative = (nf: NarrativeFlow | null) => {
      if (!isCancelled) setNarrativeFlow(nf);
    };

    // 1) Read from store immediately
    if (deckData && deckData.uuid === deckId) {
      if (deckData.notes?.story_arc) {
        safeSetNarrative(deckData.notes as NarrativeFlow);
      } else {
        safeSetNarrative(null);
      }
    } else {
      safeSetNarrative(null);
    }

    // 2) If narrative not present yet, poll backend briefly until it's ready
    const hasNarrativeInStore = Boolean(deckData && deckData.uuid === deckId && deckData.notes?.story_arc);
    const shouldPoll = Boolean(deckId) && !hasNarrativeInStore;
    if (!shouldPoll) {
      setIsPollingForNarrative(false);
      return () => { isCancelled = true; };
    }

    setIsPollingForNarrative(true);
    setIsLoading(true);

    let attempts = 0;
    const maxAttempts = 60; // allow up to ~2 minutes

    const poll = async () => {
      while (!isCancelled && attempts < maxAttempts) {
        try {
          const latest = await deckSyncService.getDeck(deckId!, true);
          const latestNotes = (latest as any)?.notes;
          const latestOutlineNarrative = (latest as any)?.outline?.narrativeFlow;
          if (latest && latest.uuid === deckId && (latestNotes?.story_arc || latestOutlineNarrative?.story_arc)) {
            // Update local store without writing back to backend
            const { updateDeckData } = useDeckStore.getState();
            const nf = (latestNotes?.story_arc ? latestNotes : latestOutlineNarrative) as NarrativeFlow;
            updateDeckData({ notes: nf as any }, { skipBackend: true, isRealtimeUpdate: true });
            safeSetNarrative(nf);
            break;
          }
        } catch (err) {
          // Silent error; try again
        }
        attempts += 1;
        // Backoff: faster at first, then slower
        const delayMs = attempts < 5 ? 1000 : 2000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      if (!isCancelled) {
        setIsPollingForNarrative(false);
        setIsLoading(false);
      }
    };

    // Fire and forget
    poll();

    return () => {
      isCancelled = true;
    };
  }, [deckId, deckData?.uuid, deckData?.notes?.story_arc]);
  
  // Return deck from store
  const deck = deckData && deckData.uuid === deckId ? deckData : null;
  
  return { deck, narrativeFlow, isLoading, isPollingForNarrative };
} 