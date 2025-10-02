/**
 * Clean, simple slide generation manager
 * Handles slide lifecycle without complex state mutations
 */

import { SlideData } from '@/types/SlideTypes';

export interface SlideGenerationState {
  slides: SlideData[];
  isGenerating: boolean;
  progress: number;
  currentSlideIndex: number;
  totalSlides: number;
}

export class CleanSlideManager {
  private deckId: string;
  
  constructor(deckId: string) {
    this.deckId = deckId;
  }
  
  /**
   * Initialize slides from outline - preserves existing slides
   */
  initializeSlides(
    slideTitles: string[], 
    existingSlides: SlideData[] = []
  ): SlideData[] {
    // Map titles to slides, preserving existing data
    return slideTitles.map((title, index) => {
      const existing = existingSlides[index];
      
      if (existing) {
        // Update existing slide, keep everything stable
        return {
          ...existing,
          title: (title && String(title).trim()) || existing.title || `Slide ${index + 1}`,
          // Keep status if slide has real content
          status: this.hasRealContent(existing) ? 'completed' : 'pending'
        } as SlideData;
      }
      
      // Create new slide with stable ID
      return {
        id: `${this.deckId}-slide-${index}`,
        title: (title && String(title).trim()) || `Slide ${index + 1}`,
        components: [],
        order: index,
        deckId: this.deckId,
        status: 'pending',
        content: ''
      } as SlideData;
    });
  }
  
  /**
   * Update a single slide with generated content
   */
  updateSlideContent(
    slides: SlideData[],
    slideIndex: number,
    slideData: Partial<SlideData>
  ): SlideData[] {
    // Ensure we have enough slides
    const updatedSlides = [...slides];
    
    // Pad array if needed
    while (updatedSlides.length <= slideIndex) {
      updatedSlides.push({
        id: `${this.deckId}-slide-${updatedSlides.length}`,
        title: `Slide ${updatedSlides.length + 1}`,
        components: [],
        order: updatedSlides.length,
        deckId: this.deckId,
        status: 'pending',
        content: ''
      } as SlideData);
    }
    
    // Update the slide but ALWAYS preserve the original ID
    const originalId = updatedSlides[slideIndex].id;
    updatedSlides[slideIndex] = {
      ...updatedSlides[slideIndex],
      ...slideData,
      id: originalId, // Never change the ID
      status: 'completed'
    } as SlideData;
    
    return updatedSlides;
  }
  
  /**
   * Check if a slide has real content (not just background)
   */
  private hasRealContent(slide: SlideData): boolean {
    if (!slide.components || slide.components.length === 0) {
      return false;
    }
    
    return slide.components.some(c => 
      c.type !== 'Background' && 
      !c.id?.toLowerCase().includes('background')
    );
  }
  
  /**
   * Get generation progress from slide statuses
   */
  getProgress(slides: SlideData[]): number {
    if (slides.length === 0) return 0;
    
    const completed = slides.filter(s => 
      s.status === 'completed' || this.hasRealContent(s)
    ).length;
    
    return Math.round((completed / slides.length) * 100);
  }
}