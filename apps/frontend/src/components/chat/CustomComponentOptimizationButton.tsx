import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Maximize2, 
  CheckCircle, 
  AlertCircle,
  Loader
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeckStore } from '@/stores/deckStore';
import { useNavigation } from '@/context/NavigationContext';
import { CustomComponentOptimizationService } from '@/services/CustomComponentOptimizationService';

interface CustomComponentOptimizationButtonProps {
  deckId?: string;
  onComplete?: () => void;
}

export const CustomComponentOptimizationButton: React.FC<CustomComponentOptimizationButtonProps> = ({ 
  deckId, 
  onComplete 
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCustomComponents, setHasCustomComponents] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [optimizedComponents, setOptimizedComponents] = useState(0);
  
  const { deckData } = useDeckStore();
  const { navigateToSlide } = useNavigation();
  
  // Check if deck has custom components
  useEffect(() => {
    const checkForCustomComponents = async () => {
      const hasComponents = await CustomComponentOptimizationService.checkIfOptimizationNeeded();
      setHasCustomComponents(hasComponents);
    };
    
    checkForCustomComponents();
  }, [deckData]);
  
  // Reset complete state after timeout
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        setIsComplete(false);
        setOptimizedComponents(0);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);
  
  // Reset error state after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  const handleOptimize = async () => {
    if (!deckData || !deckData.slides || deckData.slides.length === 0) return;
    if (!hasCustomComponents) return;
    
    setIsOptimizing(true);
    setIsComplete(false);
    setError(null);
    setCurrentSlide(0);
    setTotalSlides(0);
    setOptimizedComponents(0);
    
    try {
      console.log('[CustomComponentOptimization] Starting manual optimization...');
      
      const slides = deckData?.slides || [];
      setTotalSlides(slides.length);
      
      // Progress callback
      const onProgress = async (current: number, total: number) => {
        setCurrentSlide(current);
        setTotalSlides(total);
      };
      
      // Run optimization with navigation
      const result = await CustomComponentOptimizationService.optimizeDeckWithNavigation(
        navigateToSlide,
        true, // Force optimization
        onProgress
      );
      
      // Update stats
      setTotalSlides(result.totalSlides);
      setOptimizedComponents(result.optimizedComponents);
      
      // Mark as complete if we optimized something
      if (result.optimizedComponents > 0) {
        setIsComplete(true);
        console.log(`[CustomComponentOptimization] Optimization complete: ${result.optimizedComponents} components optimized`);
        onComplete?.();
      } else {
        console.log('[CustomComponentOptimization] No components needed optimization');
        setIsComplete(true);
      }
    } catch (err) {
      console.error('[CustomComponentOptimization] Optimization failed:', err);
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };
  
  // Don't show button if no custom components
  if (!hasCustomComponents) {
    return null;
  }
  
  const getTooltipContent = () => {
    if (error) return error;
    if (isComplete) {
      if (optimizedComponents > 0) {
        return `Optimized ${optimizedComponents} custom component${optimizedComponents !== 1 ? 's' : ''}`;
      }
      return 'All custom components are already optimized';
    }
    if (isOptimizing) {
      return `Optimizing slide ${currentSlide} of ${totalSlides}...`;
    }
    return 'Optimize custom components to fit properly within their containers';
  };
  
  const getButtonVariant = () => {
    if (error) return 'destructive';
    if (isComplete) return 'default';
    return 'outline';
  };
  
  const getIcon = () => {
    if (error) return <AlertCircle className="h-4 w-4" />;
    if (isComplete) return <CheckCircle className="h-4 w-4" />;
    if (isOptimizing) return <Loader className="h-4 w-4 animate-spin" />;
    return <Maximize2 className="h-4 w-4" />;
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={getButtonVariant()}
            size="sm"
            onClick={handleOptimize}
            disabled={isOptimizing || !hasCustomComponents}
            className={`transition-all ${
              isComplete && !error ? 'bg-green-600 hover:bg-green-700 text-white' : ''
            }`}
          >
            {getIcon()}
            <span className="ml-2">
              {isOptimizing ? 'Optimizing...' : 'Optimize Components'}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipContent()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
