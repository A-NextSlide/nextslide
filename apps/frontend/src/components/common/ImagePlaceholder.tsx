import React from 'react';
import { ImageIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImagePlaceholderProps {
  message?: string;
  showAnimation?: boolean;
  className?: string;
  size?: 'small' | 'medium' | 'large';
  onSelectImage?: () => void;
  showBackground?: boolean;
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({ 
  message = "Searching for the perfect image...", 
  showAnimation = false,  // Changed default to false
  className = "",
  size = 'medium',
  onSelectImage,
  showBackground = true
}) => {
  // Adjust sizes based on the size prop
  const iconSize = size === 'small' ? 'w-8 h-8' : size === 'large' ? 'w-16 h-16' : 'w-12 h-12';
  const containerPadding = size === 'small' ? 'p-3' : size === 'large' ? 'p-8' : 'p-6';
  const sparkleSize = size === 'small' ? 'w-3 h-3' : size === 'large' ? 'w-6 h-6' : 'w-5 h-5';
  const textSize = size === 'small' ? 'text-xs' : size === 'large' ? 'text-base' : 'text-sm';
  const dotSize = size === 'small' ? 'w-1.5 h-1.5' : size === 'large' ? 'w-3 h-3' : 'w-2 h-2';
  
  // Paint splatter SVG component - using the same one from SplatterLoadingOverlay
  const PaintSplatter = () => (
    <svg 
      className="absolute inset-0 w-full h-full opacity-5"
      viewBox="0 0 200 200" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      <path 
        d="M71.4169 11.2228C71.4169 -2.42471 91.3273 -3.82704 93.4064 9.66116C94.9191 19.4752 107.599 22.5023 113.355 14.4109L118.685 6.91864C126.14 -3.56157 142.242 6.16504 136.434 17.6406L131.455 27.4786C128.192 33.9246 135.386 40.6279 141.586 36.9188C148.285 32.9111 155.686 40.9261 151.158 47.285L139.71 63.3623C136.358 68.0686 138.087 74.6611 143.317 77.1169L145.227 78.0137C151.567 80.9909 151.567 90.0086 145.227 92.9858C139.701 95.5808 138.795 103.064 143.542 106.903L151.871 113.638C160.301 120.455 152.578 133.804 142.467 129.895C134.45 126.796 126.825 135.21 130.517 142.971C135.377 153.189 122.007 162.451 114.576 153.92L113.325 152.484C107.49 145.786 96.4694 149.464 95.8282 158.325L94.4162 177.834C93.525 190.147 75.4526 190.147 74.5614 177.834L73.5086 163.288C72.8692 154.453 61.2144 151.726 56.7223 159.361C51.3742 168.45 37.4422 162.561 40.2347 152.392L41.9494 146.147C44.3493 137.407 34.705 130.313 27.076 135.207L24.9102 136.596C13.5543 143.88 1.72166 128.065 11.9147 119.226L16.4471 115.296C23.571 109.119 19.6889 97.413 10.2856 96.7168C-2.4809 95.7714 -2.94331 77.2064 9.76032 75.6267L23.0287 73.9768C29.4883 73.1735 33.4953 66.5394 31.2 60.4482L26.0047 46.6605C24.6486 43.0618 28.3991 39.6615 31.8481 41.3627C35.9058 43.3641 39.8575 38.4695 37.0457 34.9249L22.7139 16.8577C15.4735 7.73022 27.9891 -3.83115 36.515 4.10896L52.8364 19.309C59.9026 25.8898 71.4169 20.8788 71.4169 11.2228Z" 
        fill="#FF4301"
        transform="translate(50, 50)"
      />
    </svg>
  );
  
  return (
    <div className={`relative flex flex-col items-center justify-center w-full h-full ${showBackground ? 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900' : ''} ${className}`}>
      {/* Faded splat background */}
      <PaintSplatter />
      
      {/* Main content container with proper spacing */}
      <div className="relative flex flex-col items-center gap-4">
        {/* Select Image Button - positioned above the icon */}
        {onSelectImage && (
          <div className="animate-pulse-glow rounded-md">
            <Button
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                e.preventDefault();
                (e.nativeEvent as any).stopImmediatePropagation?.();
                onSelectImage();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              variant="default"
              size="sm"
              className="shadow-lg hover:shadow-xl transition-all h-8 px-3 text-xs whitespace-nowrap bg-primary hover:bg-primary/90"
            >
              Select Image
            </Button>
          </div>
        )}
        
        {/* Icon container wrapper for proper animation */}
        <div className={`relative ${showAnimation ? 'float-animation' : ''}`}>
          {/* Background circle with gradient */}
          <div className={`absolute inset-0 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/20 dark:to-pink-600/20 rounded-full blur-xl ${showAnimation ? 'animate-pulse' : ''}`} />
          
          {/* Main icon container */}
          <div className={`relative bg-white dark:bg-gray-800 rounded-full ${containerPadding} shadow-lg`}>
            <ImageIcon className={`${iconSize} text-gray-400 dark:text-gray-500`} />
            
            {/* Sparkles animation - positioned relative to icon container */}
            {showAnimation && size !== 'small' && (
              <>
                <Sparkles className={`absolute -top-2 -right-2 ${sparkleSize} text-purple-500 sparkle-animation`} style={{ animationDelay: '0s' }} />
                <Sparkles className={`absolute -bottom-1 -left-1 ${sparkleSize === 'w-3 h-3' ? 'w-2.5 h-2.5' : sparkleSize === 'w-6 h-6' ? 'w-5 h-5' : 'w-4 h-4'} text-pink-500 sparkle-animation`} style={{ animationDelay: '0.7s' }} />
                <Sparkles className={`absolute top-1/2 -right-3 ${sparkleSize === 'w-3 h-3' ? 'w-2 h-2' : sparkleSize === 'w-6 h-6' ? 'w-4 h-4' : 'w-3 h-3'} text-blue-500 sparkle-animation`} style={{ animationDelay: '1.4s' }} />
              </>
            )}
          </div>
        </div>
        
        {/* Loading dots */}
        {showAnimation && size !== 'small' && !onSelectImage && (
          <div className="flex space-x-1 relative">
            <div className={`${dotSize} bg-purple-400 dark:bg-purple-600 rounded-full animate-bounce`} style={{ animationDelay: '0ms' }} />
            <div className={`${dotSize} bg-pink-400 dark:bg-pink-600 rounded-full animate-bounce`} style={{ animationDelay: '150ms' }} />
            <div className={`${dotSize} bg-blue-400 dark:bg-blue-600 rounded-full animate-bounce`} style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePlaceholder;
