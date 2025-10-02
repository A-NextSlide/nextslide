import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const styles = `
  @keyframes animation-delay-500 {
    0% { opacity: 0.2; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(1.1); }
    100% { opacity: 0.2; transform: scale(1); }
  }
  
  .animation-delay-500 {
    animation: animation-delay-500 2s ease-in-out infinite;
    animation-delay: 0.5s;
  }
`;

interface SlideGeneratingPlaceholderProps {
  slideTitle?: string;
  slideNumber?: number;
  totalSlides?: number;
  isCurrentlyGenerating?: boolean;
  className?: string;
}

// Add styles to head if not already present
if (typeof document !== 'undefined' && !document.getElementById('slide-generating-styles')) {
  const style = document.createElement('style');
  style.id = 'slide-generating-styles';
  style.innerHTML = `
    @keyframes slidePattern {
      0% { transform: translate(0, 0); }
      100% { transform: translate(40px, 40px); }
    }
    
    @keyframes slideProgress {
      0% { width: 0%; }
      50% { width: 70%; }
      100% { width: 95%; }
    }
    
    .animate-slide-progress {
      animation: slideProgress 2s ease-in-out infinite;
    }
    
    .animate-spin-slow {
      animation: spin 3s linear infinite;
    }
  `;
  document.head.appendChild(style);
}

export default function SlideGeneratingPlaceholder({ 
  slideTitle, 
  slideNumber, 
  totalSlides,
  isCurrentlyGenerating = false,
  className = ""
}: SlideGeneratingPlaceholderProps) {
  // Inject styles
  React.useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = styles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  
  return (
    <div className={cn(
      "w-full h-full relative overflow-hidden bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20",
      className
    )}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" 
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(236, 72, 153, 0.2) 0%, transparent 50%),
                            radial-gradient(circle at 80% 80%, rgba(147, 51, 234, 0.2) 0%, transparent 50%),
                            radial-gradient(circle at 40% 80%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)`,
          }}
        />
      </div>
      
      {/* Main content - simplified when overlay is shown */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center p-8">
        {!isCurrentlyGenerating ? (
          <>
            {/* Sparkles animation */}
            <div className="relative mb-8">
              <div className="relative">
                <Sparkles className={cn(
                  "h-16 w-16 text-pink-500",
                  isCurrentlyGenerating && "animate-pulse"
                )} />
                {isCurrentlyGenerating && (
                  <div className="absolute -inset-4">
                    <div className="h-24 w-24 rounded-full border-4 border-pink-500 border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            </div>
            
            {/* Slide info */}
            <div className="text-center space-y-3 max-w-md">
              <h3 className="text-2xl font-semibold text-foreground">
                {slideTitle || `Slide ${slideNumber}`}
              </h3>
              <p className="text-muted-foreground">
                {isCurrentlyGenerating ? 'Generating this slide...' : 'Waiting to generate...'}
              </p>
              <div className="text-sm text-muted-foreground">
                Slide {slideNumber} of {totalSlides}
              </div>
            </div>
          </>
        ) : (
          // Minimal version when the progress overlay is shown
          <div className="text-center">
            <div className="mb-4">
              <div className="h-16 w-16 rounded-full border-4 border-pink-500 border-t-transparent animate-spin mx-auto" />
            </div>
            <p className="text-lg text-muted-foreground">Generating slide content...</p>
          </div>
        )}
      </div>
      
      {/* Corner decorations */}
      <div className="absolute top-4 left-4">
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 opacity-20 animate-pulse" />
      </div>
      <div className="absolute bottom-4 right-4">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 opacity-20 animate-pulse animation-delay-500" />
      </div>
    </div>
  );
} 