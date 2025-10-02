import { create } from 'zustand';

interface PresentationState {
  isPresenting: boolean;
  showControls: boolean;
  showThumbnails: boolean;
  controlsTimeout: NodeJS.Timeout | null;
  enterPresentation: () => void;
  exitPresentation: () => void;
  setShowControls: (show: boolean) => void;
  setShowThumbnails: (show: boolean) => void;
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  isPresenting: false,
  showControls: false,
  showThumbnails: false,
  controlsTimeout: null,

  enterPresentation: () => {
    // Enter fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
    set({ isPresenting: true, showControls: true });
    
    // Hide controls after 3 seconds
    const timeout = setTimeout(() => {
      set({ showControls: false });
    }, 3000);
    
    set({ controlsTimeout: timeout });
  },

  exitPresentation: () => {
    const { controlsTimeout } = get();
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    
    // First update state
    set({ 
      isPresenting: false, 
      showControls: false, 
      showThumbnails: false,
      controlsTimeout: null 
    });
    
    // Then exit fullscreen after a slight delay to avoid white flash
    setTimeout(() => {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
      }
    }, 100);
  },

  setShowControls: (show) => {
    const { controlsTimeout } = get();
    
    // Clear existing timeout
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    
    if (show) {
      // Show controls and set new timeout
      set({ showControls: true });
      
      const timeout = setTimeout(() => {
        set({ showControls: false });
      }, 3000);
      
      set({ controlsTimeout: timeout });
    } else {
      set({ showControls: false, controlsTimeout: null });
    }
  },

  setShowThumbnails: (show) => set({ showThumbnails: show }),
})); 