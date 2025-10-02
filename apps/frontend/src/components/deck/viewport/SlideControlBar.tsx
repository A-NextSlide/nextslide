import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../../ui/IconButton';
import { COLORS } from '@/utils/colors';

interface SlideControlBarProps {
  currentSlideIndex: number;
  totalSlides: number;
  isTransitioning: boolean;
  isEditing?: boolean;
  goToPrevSlide: () => void;
  goToNextSlide: () => void;
  zoomLevel?: number;
}

const SlideControlBar: React.FC<SlideControlBarProps> = ({
  currentSlideIndex,
  totalSlides,
  isTransitioning,
  isEditing = false,
  goToPrevSlide,
  goToNextSlide,
  zoomLevel = 100
}) => {
  return (
    <div 
      className="flex flex-col items-center z-10" 
      style={{
        width: '100%',
        maxWidth: '1400px', // Match the slide width
        marginTop: '10px',
        transition: 'all 0.3s ease-in-out'
      }}
    >
      <div className="flex items-center w-full py-0 px-1">
        {/* Left side area */}
        <div className="flex items-center gap-1 justify-start flex-1 min-w-8">
          {/* Left area is empty */}
        </div>
        
        {/* Slide indicator - centered */}
        <div 
          className="glass-panel px-3 py-1 rounded-full text-xs font-medium text-muted-foreground mx-auto"
        >
          {currentSlideIndex + 1} / {totalSlides}
        </div>
        
        {/* Navigation buttons - right aligned */}
        <div 
          className="flex items-center gap-2 justify-end flex-1"
        >
          <IconButton
            onClick={goToPrevSlide}
            disabled={currentSlideIndex <= 0}
            variant="ghost"
            size="xs"
            className="hover:bg-transparent"
            style={{ 
              color: COLORS.SUGGESTION_PINK
            }}
          >
            <ChevronLeft size={18} />
          </IconButton>
          
          <IconButton
            onClick={goToNextSlide}
            disabled={currentSlideIndex >= totalSlides - 1}
            variant="ghost"
            size="xs"
            className="hover:bg-transparent"
            style={{ 
              color: COLORS.SUGGESTION_PINK
            }}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      
      {/* Theme selector and editor removed */}
    </div>
  );
};

export default SlideControlBar;
