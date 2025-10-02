import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface ImageCarouselProps {
  slides: SlideImages[];
  totalImages: number;
  onClose?: () => void;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ slides, totalImages, onClose }) => {
  // Track the newest slide to animate it
  const [newestSlideId, setNewestSlideId] = useState<string | null>(null);
  
  // Auto-expand the newest slide
  const [expandedSlide, setExpandedSlide] = useState<string | null>(newestSlideId);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousSlidesCountRef = useRef(slides.length);
  
  // Auto-expand newest slide when new slides are added
  useEffect(() => {
    if (slides.length > previousSlidesCountRef.current && newestSlideId) {
      console.log('🎯 Auto-expanding newest slide:', newestSlideId);
      setExpandedSlide(newestSlideId);
    }
    previousSlidesCountRef.current = slides.length;
  }, [slides.length, newestSlideId]);
  
  // Debug logging
  useEffect(() => {
    console.log('ImageCarousel state:', {
      slidesCount: slides.length,
      expandedSlide,
      newestSlideId,
      firstSlideTitle: slides[0]?.slide_title
    });
  }, [slides, expandedSlide, newestSlideId]);

  // Effect to detect when new slides are added
  useEffect(() => {
    if (slides.length > 0) {
      const lastSlide = slides[slides.length - 1];
      if (lastSlide.slide_id !== newestSlideId) {
        setNewestSlideId(lastSlide.slide_id);
        // Reset after animation
        setTimeout(() => setNewestSlideId(null), 1000);
      }
    }
  }, [slides]);

  console.log('🎠 ImageCarousel rendered:', {
    slidesCount: slides.length,
    totalImages,
    expandedSlide,
    firstSlide: slides[0],
    firstSlideImages: slides[0]?.images?.length || 0
  });

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Keep slides in original order (newest at bottom)
  const sortedSlides = [...slides];

  return (
    <>
      <div className="w-full bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg p-2 border border-zinc-200 dark:border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ChevronRight 
              className={cn(
                "w-3 h-3 transition-transform",
                !isCollapsed && "rotate-90"
              )}
            />
            <ImageIcon className="w-3 h-3 text-pink-500" />
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Collected {totalImages} images for {slides.length} slides
            </span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Slides with images - only show when not collapsed */}
        {!isCollapsed && (
          <div className="space-y-2">
            {sortedSlides.map((slide, index) => {
              const isNewest = index === sortedSlides.length - 1; // Last in array is newest
              const isExpanded = expandedSlide === slide.slide_id;
              
              return (
                <div 
                  key={index} 
                  className={cn(
                    "mb-2 cursor-pointer",
                    expandedSlide === slide.slide_id ? 'ring-2 ring-pink-500 rounded-lg' : '',
                    slide.slide_id === newestSlideId ? 'animate-slide-in' : ''
                  )}
                  onClick={() => setExpandedSlide(expandedSlide === slide.slide_id ? null : slide.slide_id)}
                >
                  <div className="flex items-center justify-between p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded">
                    <div className="flex items-center gap-2 flex-1">
                      <ChevronRight 
                        className={cn(
                          "w-4 h-4 transition-transform text-zinc-500",
                          expandedSlide === slide.slide_id && "rotate-90"
                        )}
                      />
                      <span className="text-sm font-medium">
                        Slide {index + 1}: {slide.slide_title}
                      </span>
                      <span className="text-xs text-zinc-500">
                        ({slide.images.length} images)
                      </span>
                      {slide.slide_id === newestSlideId && (
                        <span className="text-xs px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-full animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Image carousel for this slide */}
                  {isExpanded && (
                    <div className="relative group ml-4">
                      {/* Left scroll button */}
                      <button
                        onClick={() => handleScroll('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white/80 dark:bg-black/80 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>

                      {/* Right scroll button */}
                      <button
                        onClick={() => handleScroll('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white/80 dark:bg-black/80 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>

                      {/* Scrollable image container */}
                      <div 
                        ref={scrollContainerRef}
                        className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600 pb-2"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        {slide.images.map((image) => (
                          <div
                            key={image.id}
                            className="flex-shrink-0 relative group/image cursor-pointer"
                            onClick={() => setSelectedImage(image)}
                          >
                            <img
                              src={image.thumbnail}
                              alt={image.alt}
                              className="h-16 w-24 object-cover rounded-md border border-zinc-200 dark:border-zinc-700"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                              <Maximize2 className="w-3 h-3 text-white" />
                            </div>
                            {image.photographer && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded-b-md opacity-0 group-hover/image:opacity-100 transition-opacity truncate">
                                © {image.photographer}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox for selected image */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            {selectedImage.photographer && (
              <div className="absolute bottom-4 left-4 bg-black/70 text-white text-sm px-3 py-1.5 rounded-md">
                Photo by {selectedImage.photographer}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ImageCarousel; 