import { create } from 'zustand';

interface EditModeTransitionState {
  isInTransition: boolean;
  suppressChartRenders: boolean;
  suppressThumbnailRenders: boolean;
  skipNonVisibleSlideLoading: boolean;
  subscriptionDisabledByEditor: boolean;
  
  // Actions
  startTransition: () => void;
  endTransition: () => void;
  setSuppressChartRenders: (suppress: boolean) => void;
  setSuppressThumbnailRenders: (suppress: boolean) => void;
  setSkipNonVisibleSlideLoading: (skip: boolean) => void;
  setSubscriptionDisabledByEditor: (disabled: boolean) => void;
  
  // Batch update for performance
  batchUpdate: (updates: Partial<EditModeTransitionState>) => void;
}

export const useEditModeTransitionStore = create<EditModeTransitionState>((set) => ({
  // Initial state
  isInTransition: false,
  suppressChartRenders: false,
  suppressThumbnailRenders: false,
  skipNonVisibleSlideLoading: false,
  subscriptionDisabledByEditor: false,
  
  // Actions
  startTransition: () => set({
    isInTransition: true,
    suppressChartRenders: true,
    suppressThumbnailRenders: true,
    skipNonVisibleSlideLoading: true
  }),
  
  endTransition: () => set({
    isInTransition: false,
    suppressChartRenders: false,
    suppressThumbnailRenders: false,
    skipNonVisibleSlideLoading: false
  }),
  
  setSuppressChartRenders: (suppress) => set({ suppressChartRenders: suppress }),
  setSuppressThumbnailRenders: (suppress) => set({ suppressThumbnailRenders: suppress }),
  setSkipNonVisibleSlideLoading: (skip) => set({ skipNonVisibleSlideLoading: skip }),
  setSubscriptionDisabledByEditor: (disabled) => set({ subscriptionDisabledByEditor: disabled }),
  
  // Batch update for performance
  batchUpdate: (updates) => set(updates)
}));

// Make the store globally accessible for critical operations
if (typeof window !== 'undefined') {
  (window as any).__editModeTransitionStore = useEditModeTransitionStore;
} 