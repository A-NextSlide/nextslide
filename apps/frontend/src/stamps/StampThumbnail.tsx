import React, { useMemo } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { useSlideStamp } from './useSlideStamp';

interface StampThumbnailProps {
  slide: SlideData;
  className?: string;
  onClick?: () => void;
  slideSize?: { width: number; height: number };
  isLocked?: boolean;
}

/**
 * Drop-in thumbnail component that uses pre-rendered stamp images.
 * Shows cached stamp as <img>, or a background placeholder with spinner while generating.
 */
const StampThumbnail: React.FC<StampThumbnailProps> = ({
  slide,
  className = '',
  onClick,
  slideSize,
  isLocked = false,
}) => {
  const { stampUrl, isGenerating, backgroundStyle } = useSlideStamp(slide, slideSize);

  const hasContent = Array.isArray(slide?.components) && slide.components.length > 0;

  const containerClasses = cn(
    'relative overflow-hidden rounded cursor-pointer w-full h-full',
    'hover:ring-2 hover:ring-primary/50',
    className
  );

  // Locked blur filter
  const lockedStyle: React.CSSProperties = isLocked
    ? { filter: 'blur(16px) saturate(0.7) brightness(0.95)' }
    : {};

  return (
    <div className={containerClasses} onClick={onClick} style={backgroundStyle}>
      {/* Stamp image - shown when cached */}
      {stampUrl && (
        <img
          src={stampUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={lockedStyle}
          draggable={false}
        />
      )}

      {/* Generating spinner - shown during capture */}
      {!stampUrl && hasContent && isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center" style={lockedStyle}>
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary/80 rounded-full animate-spin" />
        </div>
      )}

      {/* Empty slide label */}
      {!stampUrl && !hasContent && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[10px] font-medium text-zinc-600">Empty</div>
        </div>
      )}

      {/* Locked slide overlay */}
      {isLocked && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="absolute top-1 right-1 bg-black/70 rounded-full p-1">
            <Lock className="w-2.5 h-2.5 text-white" />
          </div>
          <div className="bg-black/50 rounded-lg px-2 py-1 flex items-center gap-1">
            <Lock className="w-3 h-3 text-white" />
            <span className="text-[9px] text-white font-medium">Locked</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StampThumbnail;
