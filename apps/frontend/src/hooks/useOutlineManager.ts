import { useState, useCallback, useRef } from 'react';
import { DeckOutline, SlideOutline } from '@/types/SlideTypes';
import { v4 as uuidv4 } from 'uuid';

export const useOutlineManager = (initialOutline: DeckOutline | null = null) => {
  const [currentOutline, setCurrentOutline] = useState<DeckOutline | null>(initialOutline);
  const isAddingSlide = useRef(false);
  
  // Add a reset function to clear the outline
  const resetOutline = useCallback(() => {
    setCurrentOutline(null);
  }, []);

  const lastAddedSlideIdRef = useRef<string | null>(null);

  const handleAddSlide = useCallback(() => {
    // Prevent multiple rapid additions
    if (isAddingSlide.current) return;
    isAddingSlide.current = true;
    
    setCurrentOutline(prevOutline => {
      if (!prevOutline) {
        isAddingSlide.current = false;
        return null;
      }
      const newId = uuidv4();
      lastAddedSlideIdRef.current = newId;
      const newSlide: SlideOutline = { id: newId, title: 'New Slide', content: '', deepResearch: false, isManual: true };
      return {
        ...prevOutline,
        slides: [...prevOutline.slides, newSlide],
      };
    });
    
    // Schedule scrolling to the bottom after state update and DOM rendering
    setTimeout(() => {
      const newId = lastAddedSlideIdRef.current;
      const newSlideEl = newId ? document.getElementById(`manual-slide-${newId}`) : null;
      if (newSlideEl) {
        newSlideEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const scrollContainer = document.querySelector('.outline-scrollable') as HTMLElement | null;
        if (scrollContainer) {
          scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
        }
      }
      isAddingSlide.current = false;
    }, 120);
  }, []);

  const handleSlideTitleChange = useCallback((slideId: string, title: string) => {
    setCurrentOutline(prevOutline => {
      if (!prevOutline) return null;
      const updatedSlides = prevOutline.slides.map(slide =>
        slide.id === slideId ? { ...slide, title } : slide
      );
      return { ...prevOutline, slides: updatedSlides };
    });
  }, []);

  const handleSlideContentChange = useCallback((slideId: string, content: string) => {
    setCurrentOutline(prevOutline => {
      if (!prevOutline) return null;
      // Remove citation markers like 【4:0†source】
      const filteredContent = content.replace(/【\d+:\d+†source】/g, '');
      const updatedSlides = prevOutline.slides.map(slide =>
        slide.id === slideId ? { ...slide, content: filteredContent } : slide
      );
      return { ...prevOutline, slides: updatedSlides };
    });
  }, []);

  const handleSlideReorder = useCallback((draggedSlideId: string, targetSlideId: string) => {
    setCurrentOutline(prevOutline => {
      if (!prevOutline) return null;

      const sourceIndex = prevOutline.slides.findIndex(s => s.id === draggedSlideId);
      const targetIndex = prevOutline.slides.findIndex(s => s.id === targetSlideId);

      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prevOutline;

      const newSlides = [...prevOutline.slides];
      const [draggedItem] = newSlides.splice(sourceIndex, 1);
      newSlides.splice(targetIndex, 0, draggedItem);
      
      // Mark for animation (optional, can be handled in UI or by returning indices)
      // This example doesn't directly set animateReorder, assuming UI handles it or it's done in a follow-up effect.

      return { ...prevOutline, slides: newSlides };
    });
  }, []);
  
  const handleToggleDeepResearch = useCallback((slideId: string, event?: React.MouseEvent) => {
    console.log(`[useOutlineManager] handleToggleDeepResearch called for slide ${slideId}`);
    
    if (event) {
      // Prevent any default behavior that might cause scrolling
      event.preventDefault();
      event.stopPropagation();
    }
    
    // Capture current scroll position
    const scrollContainer = document.querySelector('.outline-scrollable') as HTMLElement | null;
    const scrollPosition = scrollContainer?.scrollTop || 0;
    
    // Temporarily disable scroll anchoring
    if (scrollContainer) {
      scrollContainer.style.overflow = 'hidden';
    }
    
    // Update the state without using setTimeout or scroll manipulation
    setCurrentOutline(prevOutline => {
      if (!prevOutline) return null;
      const updatedSlides = prevOutline.slides.map(s => 
        s.id === slideId ? { ...s, deepResearch: !s.deepResearch } : s
      );
      return { ...prevOutline, slides: updatedSlides };
    });
    
    // Restore scroll position after state update and re-enable scrolling with minimal delay
    requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.style.overflow = '';
        scrollContainer.scrollTop = scrollPosition;
      }
    });
  }, []);

  const handleDeleteSlide = useCallback((slideId: string) => {
    setCurrentOutline(prevOutline => {
        if (!prevOutline) return null;
        const updatedSlides = prevOutline.slides.filter(s => s.id !== slideId);
        return { ...prevOutline, slides: updatedSlides };
    });
  }, []);


  return {
    currentOutline,
    setCurrentOutline, // Expose raw setter for flexibility (e.g., initial set from chat, research updates)
    resetOutline,
    handleAddSlide,
    handleSlideTitleChange,
    handleSlideContentChange,
    handleSlideReorder,
    handleToggleDeepResearch,
    handleDeleteSlide,
  };
}; 