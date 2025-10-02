import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import ImageCarousel from './ImageCarousel';

interface ImageItem {
  url: string;
  thumbnail: string;
  photographer?: string;
  alt: string;
  id: number | string;
}

interface SlideImages {
  slide_id: string;
  slide_title: string;
  images: ImageItem[];
}

interface ImageCarouselWithLoadingProps {
  slides: SlideImages[];
  totalImages: number;
  isLoading?: boolean;
  showDuration?: number;
  maxPreviewImages?: number;
}

const ImageCarouselWithLoading: React.FC<ImageCarouselWithLoadingProps> = ({ 
  slides, 
  totalImages, 
  isLoading = false,
  showDuration = 10000,
  maxPreviewImages = 10
}) => {
  const [showImages, setShowImages] = useState(true);
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);

  useEffect(() => {
    // If showDuration is 0, immediately show completion message
    if (showDuration === 0 && !isLoading) {
      setShowCompletionMessage(true);
      // Hide everything after showing completion message
      setTimeout(() => {
        setShowImages(false);
      }, 3000);
      return;
    }
    
    // Reset completion message if still loading
    if (isLoading) {
      setShowCompletionMessage(false);
    }
  }, [isLoading, showDuration]);

  if (!showImages) {
    return null;
  }

  if (showCompletionMessage) {
    return (
      <div className="w-full bg-green-50/50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-700">
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
          <span>✅ Successfully collected {totalImages} images for your presentation</span>
        </div>
      </div>
    );
  }

  // Debug logging
  console.log('ImageCarouselWithLoading:', {
    slidesCount: slides.length,
    totalImages,
    isLoading,
    showCompletionMessage,
    firstSlideImages: slides[0]?.images?.length || 0
  });

  // If no slides, show a message
  if (!slides || slides.length === 0) {
    return (
      <div className="w-full bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          No images found yet...
        </div>
      </div>
    );
  }

  // Just show the carousel without any overlay or limitations
  return (
    <ImageCarousel 
      slides={slides} 
      totalImages={totalImages}
    />
  );
};

export default ImageCarouselWithLoading; 