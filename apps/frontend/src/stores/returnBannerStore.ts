import { create } from 'zustand';

interface ReturnBannerState {
  pendingShareCode: string | null;
  pendingDeckName: string | null;
  setPendingPresentation: (shareCode: string, deckName?: string) => void;
  clearPendingPresentation: () => void;
}

export const useReturnBannerStore = create<ReturnBannerState>((set) => ({
  pendingShareCode: null,
  pendingDeckName: null,
  setPendingPresentation: (shareCode: string, deckName?: string) =>
    set({ pendingShareCode: shareCode, pendingDeckName: deckName || 'your presentation' }),
  clearPendingPresentation: () =>
    set({ pendingShareCode: null, pendingDeckName: null }),
}));
