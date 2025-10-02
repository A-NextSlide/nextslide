import React from 'react';
import Slide from '../../Slide';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { DeckStatus } from '@/types/DeckTypes';
import SlideGeneratingUI from '../../common/SlideGeneratingUI';
import SelectionRectangle from '@/components/SelectionRectangle';

interface SimpleSlideDisplayProps {
  slide: SlideData | null;
  slideIndex: number;
  slides: SlideData[];
  direction: 'next' | 'prev' | null;
  isEditing: boolean;
  selectedComponentId?: string;
  onComponentSelect: (component: ComponentInstance) => void;
  updateSlide: (id: string, data: Partial<SlideData>) => void;
  deckStatus?: DeckStatus;
}

const SimpleSlideDisplay: React.FC<SimpleSlideDisplayProps> = ({
  slide,
  slideIndex,
  slides,
  direction,
  isEditing,
  selectedComponentId,
  onComponentSelect,
  updateSlide,
  deckStatus
}) => {
  if (!slide) return null;
  
  const isDeckGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
  const hasComponents = Array.isArray(slide.components) && slide.components.length > 0;
  
  // Show generating UI only when there are no components yet
  if (!hasComponents) {
    if (isDeckGenerating || slide.status === 'pending' || slide.status === 'generating' || (slide as any).isGenerating) {
      return (
        <SlideGeneratingUI
          slideNumber={slideIndex + 1}
          totalSlides={deckStatus?.totalSlides || slides.length || 6}
          progress={deckStatus?.progress || 0}
          message={deckStatus?.message || `Generating slide ${slideIndex + 1}`}
        />
      );
    }
  }
  
  // If has any components (including just background), show the slide
  if (hasComponents) {
    return (
      <div>
        <Slide 
          key={slide.id}
          slide={slide}
          isActive={true}
          direction={direction} 
          isEditing={isEditing}
          onSave={updatedSlide => {
            updateSlide(slide.id, updatedSlide);
          }} 
          selectedComponentId={selectedComponentId}
          onComponentSelect={onComponentSelect}
        />
      </div>
    );
  }
  
  // Final fallback - empty slide with generating UI
  return (
    <SlideGeneratingUI
      slideNumber={slideIndex + 1}
      totalSlides={slides.length || 6}
      progress={0}
      message="Preparing slide"
    />
  );
};

export default SimpleSlideDisplay;