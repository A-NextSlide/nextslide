/**
 * Clean, simplified slide generation hook
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDeckStore } from '@/stores/deckStore';
import { useToast } from '@/hooks/use-toast';
import { CleanSlideManager } from '@/services/generation/CleanSlideManager';
import { GenerationCoordinator } from '@/services/generation/GenerationCoordinator';

interface UseCleanSlideGenerationOptions {
  deckId: string;
  onProgress?: (event: any) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useCleanSlideGeneration(options: UseCleanSlideGenerationOptions) {
  const { deckId, onProgress, onComplete, onError } = options;
  const { toast } = useToast();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Refs for stable references
  const managerRef = useRef<CleanSlideManager>();
  const coordinatorRef = useRef<GenerationCoordinator>();
  const hasInitializedRef = useRef(false);
  
  // Initialize manager
  useEffect(() => {
    if (!deckId) return;
    
    managerRef.current = new CleanSlideManager(deckId);
    coordinatorRef.current = GenerationCoordinator.getInstance();
    hasInitializedRef.current = false; // Reset on deck change
  }, [deckId]);
  
  /**
   * Handle generation events
   */
  const handleProgress = useCallback((event: any) => {
    const manager = managerRef.current;
    if (!manager) return;
    
    const currentDeck = useDeckStore.getState().deckData;
    
    // Handle outline structure - initialize slides ONCE
    if (event.stage === 'outline_structure' && !hasInitializedRef.current) {
      const slideTitles = event.data?.slideTitles || event.slideTitles;
      const outlineTitle = event.data?.title || event.title;
      
      if (slideTitles && slideTitles.length > 0) {
        hasInitializedRef.current = true;
        
        // Initialize slides, preserving existing ones
        const updatedSlides = manager.initializeSlides(
          slideTitles,
          currentDeck.slides
        );
        
        // Update deck with initialized slides
        useDeckStore.getState().updateDeckData({
          ...currentDeck,
          slides: updatedSlides,
          name: outlineTitle || currentDeck.name
        });
        
        console.log('[CleanSlideGeneration] Initialized slides:', updatedSlides.length);
      }
    }
    
    // Handle slide completion
    if (event.stage === 'slide_completed' || event.type === 'slide_completed') {
      const slideIndex = event.slideIndex ?? event.slide_index;
      const slideData = event.data?.slide || event.slide || event.slide_data;
      
      if (typeof slideIndex === 'number' && slideData) {
        // Update slide content
        const updatedSlides = manager.updateSlideContent(
          currentDeck.slides,
          slideIndex,
          slideData
        );
        
        // Save to store
        useDeckStore.getState().updateDeckData({
          ...currentDeck,
          slides: updatedSlides
        });
        
        // Update progress
        const newProgress = manager.getProgress(updatedSlides);
        setProgress(newProgress);
        
        console.log(`[CleanSlideGeneration] Slide ${slideIndex + 1} completed, progress: ${newProgress}%`);
      }
    }
    
    // Handle completion
    if (event.type === 'deck_complete' || event.stage === 'composition_complete') {
      setIsGenerating(false);
      setProgress(100);
      onComplete?.();
      console.log('[CleanSlideGeneration] Generation complete');
    }
    
    // Forward to external handler
    onProgress?.(event);
  }, [deckId, onProgress, onComplete]);
  
  /**
   * Start generation
   */
  const startGeneration = useCallback(async (generationOptions: any = {}) => {
    if (!deckId || !coordinatorRef.current) {
      toast({
        title: 'Error',
        description: 'Generation not ready',
        variant: 'destructive'
      });
      return;
    }
    
    // Reset initialization flag for new generation
    hasInitializedRef.current = false;
    setIsGenerating(true);
    setProgress(0);
    
    try {
      const currentDeck = useDeckStore.getState().deckData;
      
      await coordinatorRef.current.startGeneration({
        deckId,
        outline: generationOptions.outline || (currentDeck as any).outline,
        prompt: generationOptions.prompt || currentDeck.name,
        slideCount: generationOptions.slideCount || 6,
        detailLevel: generationOptions.detailLevel || 'standard',
        onProgress: handleProgress,
        onComplete: () => {
          setIsGenerating(false);
          onComplete?.();
        },
        onError: (error) => {
          setIsGenerating(false);
          onError?.(error);
          toast({
            title: 'Generation Error',
            description: error.message,
            variant: 'destructive'
          });
        }
      });
      
      if (!generationOptions.auto) {
        toast({
          title: 'Generation Started',
          description: 'Creating your slides...',
          duration: 3000
        });
      }
    } catch (error: any) {
      setIsGenerating(false);
      console.error('[CleanSlideGeneration] Error:', error);
      
      // Only show error if not a duplicate
      if (!error.message?.includes('already in progress')) {
        toast({
          title: 'Generation Error',
          description: error.message || 'Failed to start generation',
          variant: 'destructive'
        });
      }
    }
  }, [deckId, handleProgress, onComplete, onError, toast]);
  
  /**
   * Stop generation
   */
  const stopGeneration = useCallback(() => {
    if (coordinatorRef.current) {
      coordinatorRef.current.stopGeneration(deckId);
      setIsGenerating(false);
    }
  }, [deckId]);
  
  return {
    isGenerating,
    progress,
    startGeneration,
    stopGeneration
  };
}