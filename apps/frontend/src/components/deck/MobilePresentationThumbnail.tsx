/**
 * Mobile-optimized thumbnail component for presentation mode.
 * Shows either a cached screenshot or a lightweight placeholder.
 * The actual rendering/capture happens in a single offscreen slot managed by parent.
 */

import React from 'react';
import { SlideData } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';

interface MobilePresentationThumbnailProps {
  slide: SlideData;
  width: number;
  height: number;
  isActive: boolean;
  slideNumber: number;
  onClick: () => void;
  /** Cached screenshot URL, if available */
  cachedUrl: string | null;
  /** Whether this slide is currently being captured */
  isCapturing: boolean;
}

/**
 * Extract background style from slide components.
 */
function extractBackgroundStyle(slide: SlideData | null): React.CSSProperties {
  if (!slide) return { background: '#f5f5f5' };

  const comps = slide.components || [];
  const bg = comps.find(
    (c: any) => c.type === 'Background' || c.id?.toLowerCase().includes('background')
  );

  if (!bg) return { background: '#f5f5f5' };

  const props: any = bg.props || {};

  // Handle gradient backgrounds
  if (props.gradient && typeof props.gradient === 'object') {
    const g = props.gradient;
    const rawStops = g.stops || g.colors || [];

    if (rawStops.length > 0) {
      const stops = rawStops
        .filter((s: any) => s?.color)
        .map((s: any, i: number, arr: any[]) => {
          let pos = s.position ?? (i / Math.max(1, arr.length - 1)) * 100;
          if (pos <= 1 && arr.every((stop: any) => (stop.position ?? 0) <= 1)) {
            pos = pos * 100;
          }
          return `${s.color} ${pos}%`;
        })
        .join(', ');

      if (stops) {
        if (g.type === 'radial') {
          return { background: `radial-gradient(circle, ${stops})` };
        }
        const angle = typeof g.angle === 'number' ? g.angle : 180;
        return { background: `linear-gradient(${angle}deg, ${stops})` };
      }
    }
  }

  // Handle string gradient
  if (typeof props.gradient === 'string' && props.gradient) {
    return { background: props.gradient };
  }

  // Handle solid color
  const color = props.backgroundColor || props.color || props.style?.background;
  if (color) {
    return { background: color };
  }

  return { background: '#f5f5f5' };
}

const MobilePresentationThumbnail: React.FC<MobilePresentationThumbnailProps> = ({
  slide,
  width,
  height,
  isActive,
  slideNumber,
  onClick,
  cachedUrl,
  isCapturing,
}) => {
  const backgroundStyle = extractBackgroundStyle(slide);

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative group flex-shrink-0 overflow-hidden rounded-md',
        'ring-1 ring-transparent hover:ring-white/50',
        isActive && 'ring-2 ring-white'
      )}
      style={{ height, width }}
    >
      {/* Show cached screenshot if available */}
      {cachedUrl ? (
        <img
          src={cachedUrl}
          alt={`Slide ${slideNumber}`}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        /* Show background placeholder with loading indicator */
        <div
          className="relative w-full h-full overflow-hidden"
          style={backgroundStyle}
        >
          {isCapturing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Slide number badge */}
      <div className="absolute top-1 left-1 bg-black/70 rounded-full px-2 py-0.5 text-white text-xs font-medium">
        {slideNumber}
      </div>

      {/* Current indicator */}
      {isActive && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-white rounded-full px-2 py-0.5 text-black text-xs font-bold">
          Current
        </div>
      )}
    </button>
  );
};

export default MobilePresentationThumbnail;
