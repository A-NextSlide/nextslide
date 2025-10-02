import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { useDeckStore } from '../stores/deckStore';

// Context type for slide navigation
export interface NavigationContextType {
  currentSlideIndex: number;
  setCurrentSlideIndex: (index: number) => void;
}

// Context for slide navigation
export const NavigationContext = createContext<NavigationContextType>({
  currentSlideIndex: 0,
  setCurrentSlideIndex: () => {}
});

interface NavigationProviderProps {
  children: ReactNode;
  initialSlideIndex?: number;
  onSlideChange?: (index: number) => void;
}

export function NavigationProvider({ 
  children, 
  initialSlideIndex = 0,
  onSlideChange
}: NavigationProviderProps) {
  // Initialize the navigation context in the window
  if (typeof window !== 'undefined') {
    (window as any).__navigationContext = {
      currentSlideIndex: initialSlideIndex
    };
  }
  
  const [currentSlideIndex, setCurrentSlideIndexState] = useState<number>(initialSlideIndex);
  const slides = useDeckStore(state => state.deckData?.slides ?? []);
  const lastSlideDispatchRef = useRef<{ slideId: string | null; index: number | null }>({
    slideId: null,
    index: null
  });

  // Wrapper for setCurrentSlideIndex that can notify parent components
  const setCurrentSlideIndex = (index: number) => {
    if (index === currentSlideIndex) {
      return; // Don't update if index hasn't changed (prevents re-renders)
    }
    
    // Set navigation transition flag to suppress animations
    if (typeof window !== 'undefined') {
      (window as any).__isNavigatingSlides = true;
      // Clear any existing timeout to prevent premature clearing
      if ((window as any).__navigationTimeout) {
        clearTimeout((window as any).__navigationTimeout);
      }
      // Clear the flag after a longer delay to ensure all re-renders complete
      (window as any).__navigationTimeout = setTimeout(() => {
        (window as any).__isNavigatingSlides = false;
        (window as any).__navigationTimeout = null;
      }, 500); // Increased from 200ms to ensure animation completes
    }
    
    // Force state update even if the index seems to be the same (might be stale)
    setCurrentSlideIndexState(() => {
      // Store in window for faster access by other components
      if (typeof window !== 'undefined') {
        (window as any).__navigationContext = {
          currentSlideIndex: index
        };
      }
      return index; 
    });
    
    if (onSlideChange) onSlideChange(index);
  };

  // Dispatch a slidechange event any time the active slide index updates.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const targetSlide = slides?.[currentSlideIndex];
    if (!targetSlide?.id) {
      return;
    }

    if (
      lastSlideDispatchRef.current.slideId === targetSlide.id &&
      lastSlideDispatchRef.current.index === currentSlideIndex
    ) {
      return;
    }

    const fireEvent = () => {
      const w = window as any;
      const now = Date.now();
      const last = w.__lastSlideChangeDispatch;
      if (!last || last.slideId !== targetSlide.id || (now - (last.ts || 0)) > 50) {
        document.dispatchEvent(new CustomEvent('slidechange', {
          detail: { slideId: targetSlide.id, index: currentSlideIndex }
        }));
        w.__lastSlideChangeDispatch = { slideId: targetSlide.id, ts: now };
        lastSlideDispatchRef.current = { slideId: targetSlide.id, index: currentSlideIndex };
      }
    };

    let raf1: number | null = null;
    let raf2: number | null = null;

    if (typeof requestAnimationFrame === 'function') {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => fireEvent());
      });
    } else {
      Promise.resolve().then(fireEvent);
    }

    return () => {
      if (typeof cancelAnimationFrame === 'function') {
        if (raf1 !== null) cancelAnimationFrame(raf1);
        if (raf2 !== null) cancelAnimationFrame(raf2);
      }
    };
  }, [currentSlideIndex, slides]);

  return (
    <NavigationContext.Provider 
      value={{
        currentSlideIndex,
        setCurrentSlideIndex
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

// Hook for accessing navigation state
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

// Convenience hook that combines navigation and slide data to get the current slide
export function useCurrentSlide() {
  const deckData = useDeckStore(state => state.deckData);
  const { currentSlideIndex } = useNavigation();
  return deckData.slides[currentSlideIndex] || null;
}
