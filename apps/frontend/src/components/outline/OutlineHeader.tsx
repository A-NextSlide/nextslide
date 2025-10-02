import React from 'react';
import { Button } from '@/components/ui/button';
import { DeckOutline } from '@/types/SlideTypes';
import { ArrowLeft, Loader2, Microscope, ChevronLeft, Play, Sparkles, Wand2 } from 'lucide-react';
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
          <h2 className="text-2xl font-bold text-foreground truncate">
            {isProcessingFiles ? 'Processing your files...' : currentOutline.title}
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
              "h-8 px-4 text-xs font-medium shadow-lg hover:shadow-xl transition-all whitespace-nowrap",
              isOutlineGenerating 
                ? "bg-orange-100 hover:bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/30 dark:text-orange-400"
                : (isGenerating || isLocalGenerating)
                ? "bg-blue-100 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/30 dark:text-blue-400"
                : "bg-[#FF4301] hover:bg-[#FF4301]/90 text-white"
            )}
          >
            {isOutlineGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Completing Outline...
              </>
            ) : isResearching ? (
              <>
                <Microscope className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                Research: {completedResearchSlides}/{totalResearchSlides}
              </>
            ) : (isGenerating || isLocalGenerating) ? (
              generationProgress ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  <span className="inline-flex items-center gap-1">
                    Generating slide {generationProgress.currentSlide}/{generationProgress.totalSlides}
                    {generationProgress.slideTitle && (
                      <span className="text-[10px] opacity-80 max-w-[150px] truncate">
                        ({generationProgress.slideTitle})
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating...
                </>
              )
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                Generate Presentation
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OutlineHeader; 