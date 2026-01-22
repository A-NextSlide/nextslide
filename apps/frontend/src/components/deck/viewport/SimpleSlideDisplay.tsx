import React, { useEffect, useState } from 'react';
import Slide from '../../Slide';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import { DeckStatus } from '@/types/DeckTypes';
import SlideGeneratingUI, { LoaderBrandTheme } from '../../common/SlideGeneratingUI';
import SelectionRectangle from '@/components/SelectionRectangle';
import { GenerationProgressTracker, ProgressState } from '@/services/generation/GenerationProgressTracker';
import { useLockedSlides } from '@/hooks/useLockedSlides';

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
  containerWidth?: number;
  containerHeight?: number;
  brand?: LoaderBrandTheme;
  outlineTitles?: string[];
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
  deckStatus,
  containerWidth,
  containerHeight,
  brand,
  outlineTitles
}) => {
  // Track generation progress from the tracker
  const [progressState, setProgressState] = useState<ProgressState | null>(null);

  // Get locked slides info
  const { isLocked, lockedCount } = useLockedSlides();
  const slideIsLocked = isLocked(slideIndex);

  useEffect(() => {
    const tracker = GenerationProgressTracker.getInstance();
    const handleUpdate = (state: ProgressState) => {
      setProgressState(state);
    };
    tracker.on('update', handleUpdate);
    tracker.on('progressUpdate', handleUpdate);
    setProgressState(tracker.getState());
    return () => {
      tracker.off('update', handleUpdate);
      tracker.off('progressUpdate', handleUpdate);
    };
  }, []);

  // Calculate slides completed and in progress from tracker state
  const slidesCompleted = progressState?.slides?.filter(s => s.status === 'completed').length || 0;
  const slidesInProgress = progressState?.slides?.filter(s => s.status === 'generating').length || 0;
  const elapsedTime = progressState?.elapsedTime || 0;

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
          progress={progressState?.progress || deckStatus?.progress || 0}
          message={progressState?.message || deckStatus?.message || `Generating slide ${slideIndex + 1}`}
          slidesCompleted={slidesCompleted}
          slidesInProgress={slidesInProgress}
          elapsedTime={elapsedTime}
          brand={brand}
          outlineTitles={outlineTitles}
        />
      );
    }
  }
  
  // If has any components (including just background), show the slide
  if (hasComponents) {
    // Use explicit pixel dimensions if provided, otherwise fall back to 100%
    const slideStyle: React.CSSProperties = containerWidth && containerHeight 
      ? {
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${containerWidth}px`,
          height: `${containerHeight}px`
        }
      : {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        };
    
    return (
      <div className="absolute inset-0 w-full h-full">
        <Slide
          key={slide.id}
          slide={slide}
          isActive={true}
          direction={direction}
          isEditing={slideIsLocked ? false : isEditing}
          onSave={updatedSlide => {
            updateSlide(slide.id, updatedSlide);
          }}
          selectedComponentId={slideIsLocked ? undefined : selectedComponentId}
          onComponentSelect={onComponentSelect}
          style={slideStyle}
          isLocked={slideIsLocked}
          lockedCount={lockedCount}
        />
      </div>
    );
  }
  
  // Final fallback - empty slide with generating UI
  return (
    <SlideGeneratingUI
      slideNumber={slideIndex + 1}
      totalSlides={slides.length || 6}
      progress={progressState?.progress || 0}
      message="Preparing slide"
      slidesCompleted={slidesCompleted}
      slidesInProgress={slidesInProgress}
      elapsedTime={elapsedTime}
      brand={brand}
      outlineTitles={outlineTitles}
    />
  );
};

export default SimpleSlideDisplay;
