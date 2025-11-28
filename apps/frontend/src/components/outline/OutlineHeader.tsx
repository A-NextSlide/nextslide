import React from 'react';
import { Button } from '@/components/ui/button';
import { DeckOutline } from '@/types/SlideTypes';
import { ArrowLeft, Loader2, Microscope } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface OutlineHeaderProps {
  currentOutline: any;
  isGenerating: boolean;
  isOutlineGenerating?: boolean;
  researchingSlides: Set<string>;
  completedResearchSlides: number;
  totalResearchSlides: number;
  onBack: () => void;
  onGenerateDeck: () => void;
  uploadedFiles?: File[]; // Add this prop
  generationProgress?: {
    currentSlide: number;
    totalSlides: number;
    slideTitle?: string;
  } | null;
}

const OutlineHeader: React.FC<OutlineHeaderProps> = ({
  currentOutline,
  isGenerating,
  isOutlineGenerating,
  researchingSlides,
  completedResearchSlides,
  totalResearchSlides,
  onBack,
  onGenerateDeck,
  uploadedFiles = [], // Add default
  generationProgress,
}) => {
  const navigate = useNavigate();
  
  // Add generation guard with better state management
  const [isLocalGenerating, setIsLocalGenerating] = React.useState(false);
  const lastClickTimeRef = React.useRef(0);
  
  const isResearching = researchingSlides.size > 0;
  const hasAllSlidesWithContent = currentOutline && currentOutline.slides.length > 0 && 
    currentOutline.slides.every(slide => slide.content && slide.content.trim().length > 0);
  const canGenerate = hasAllSlidesWithContent && !isGenerating && !isResearching && !isOutlineGenerating && !isLocalGenerating;

  // Check if we're processing files
  const isProcessingFiles = uploadedFiles.length > 0 && (!currentOutline.slides || currentOutline.slides.length === 0);

  // Test navigation function
  const testNavigation = () => {
    const testId = '2788d198-a48d-473a-b199-ce196e66257f';
    try {
      navigate(`/deck/${testId}`);
    } catch (error) {
      console.error('❌ TEST: Navigation error:', error);
    }
  };

  return (
    <div className="border-b">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex flex-1 min-w-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-foreground hover:bg-black/10 dark:hover:bg-white/10 p-2 rounded-full mr-2 flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground truncate">
            {isProcessingFiles ? 'Processing your files...' : (currentOutline?.title || 'New Presentation')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              // Check for rapid clicks (within 1 second)
              const now = Date.now();
              if (now - lastClickTimeRef.current < 1000) {
                return;
              }
              lastClickTimeRef.current = now;

              // Guard against duplicate calls
              if (isLocalGenerating) {
                return;
              }

              setIsLocalGenerating(true);
              onGenerateDeck();

              // Reset after a longer delay to ensure the parent has time to update
              setTimeout(() => {
                setIsLocalGenerating(false);
              }, 2000);
            }}
            disabled={!canGenerate}
            size="sm"
            className={cn(
              "h-8 px-4 text-xs whitespace-nowrap transition-all border-0",
              "shadow-[0_4px_14px_0_rgba(255,67,1,0.39)] hover:shadow-[0_6px_20px_rgba(255,67,1,0.5)]",
              isOutlineGenerating
                ? "bg-orange-100 hover:bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/30 dark:text-orange-400 shadow-none hover:shadow-none"
                : (isGenerating || isLocalGenerating)
                ? "bg-blue-100 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/30 dark:text-blue-400 shadow-none hover:shadow-none"
                : "bg-gradient-to-r from-[#FF4301] to-[#FF6B35] hover:from-[#E63D00] hover:to-[#FF4301] text-white"
            )}
            style={{
              fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
              fontWeight: 800,
              letterSpacing: '0.02em',
            }}
          >
            {isOutlineGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Completing Outline...
              </>
            ) : isResearching ? (
              <>
                <Microscope className="h-4 w-4 mr-2 animate-pulse" />
                Research: {completedResearchSlides}/{totalResearchSlides}
              </>
            ) : (isGenerating || isLocalGenerating) ? (
              generationProgress ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <span className="inline-flex items-center gap-1">
                    Generating slide {generationProgress.currentSlide}/{generationProgress.totalSlides}
                    {generationProgress.slideTitle && (
                      <span className="text-xs opacity-80 max-w-[150px] truncate">
                        ({generationProgress.slideTitle})
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              )
            ) : (
              "Generate Presentation"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OutlineHeader; 