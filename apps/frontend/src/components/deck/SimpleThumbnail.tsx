import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { Presentation } from 'lucide-react';
import html2canvas from 'html2canvas';

interface SimpleThumbnailProps {
  slide: SlideData;
  className?: string;
  onClick?: () => void;
}

// Global cache for thumbnail images
const thumbnailCache = new Map<string, {
  dataUrl: string;
  timestamp: number;
  componentHash: string;
}>();

// Generate a hash of the slide components to detect changes
function generateComponentHash(slide: SlideData): string {
  if (!slide.components) return 'empty';
  
  return slide.components
    .map(c => {
      const pos = c.props?.position || { x: 0, y: 0 };
      const width = c.props?.width || 0;
      const height = c.props?.height || 0;
      const rotation = c.props?.rotation || 0;
      
      // Include key visual properties
      let extras = '';
      if (c.type === 'Chart') {
        extras = JSON.stringify(c.props?.data || []).slice(0, 100);
      } else if (c.type === 'TiptapTextBlock') {
        extras = JSON.stringify(c.props?.texts || []).slice(0, 100);
      } else if (c.type === 'Image') {
        extras = c.props?.src || '';
      }
      
      return `${c.id}:${c.type}:${pos.x}:${pos.y}:${width}:${height}:${rotation}:${extras}`;
    })
    .join('|');
}

/**
 * SimpleThumbnail - A lightweight thumbnail component that uses cached images
 * instead of re-rendering the entire slide component tree
 */
const SimpleThumbnail: React.FC<SimpleThumbnailProps> = ({ 
  slide, 
  className = '',
  onClick
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const captureRequestRef = useRef<number>(0);

  // Compute hash of slide components
  const componentHash = useMemo(() => generateComponentHash(slide), [slide]);
  
  // Compute a simple fallback background from the slide's Background component
  const fallbackBackground = useMemo(() => {
    const comps = slide?.components || [];
    const bg = comps.find(
      (comp) => comp.type === 'Background' || (comp.id && comp.id.toLowerCase().includes('background'))
    );
    if (!bg) return '#f5f5f5';
    
    const props: any = bg.props || {};
    const gradient = props.gradient || props.style?.background || (props.background && props.background.color ? props.background : null);
    
    try {
      if (typeof gradient === 'string' && gradient) return gradient;
      
      if (gradient && typeof gradient === 'object' && (Array.isArray((gradient as any).stops) || Array.isArray((gradient as any).colors))) {
        const rawStops = Array.isArray((gradient as any).stops) ? (gradient as any).stops : (gradient as any).colors;
        const stops = rawStops
          .filter((s: any) => s && s.color)
          .map((s: any, idx: number) => {
            let position = s.position;
            if (position === undefined || position === null || isNaN(position)) {
              position = (idx / Math.max(1, rawStops.length - 1)) * 100;
            }
            if (position <= 1 && rawStops.every((stop: any) => (stop.position ?? 0) <= 1)) {
              position = position * 100;
            }
            return `${s.color}${typeof position === 'number' ? ` ${position}%` : ''}`;
          })
          .join(', ');
          
        if (!stops) return '#f5f5f5';
        
        if (gradient.type === 'radial') {
          return `radial-gradient(circle, ${stops})`;
        }
        const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
        return `linear-gradient(${angle}deg, ${stops})`;
      }
    } catch {}
    
    const directColor = props.backgroundColor || props.color || props.page?.backgroundColor;
    if (typeof directColor === 'string' && directColor) return directColor;
    
    return '#f5f5f5';
  }, [slide]);

  // Check cache and capture thumbnail if needed
  useEffect(() => {
    const cacheKey = slide.id;
    const cached = thumbnailCache.get(cacheKey);
    
    // Use cached version if it exists and hasn't changed
    if (cached && cached.componentHash === componentHash) {
      setThumbnailUrl(cached.dataUrl);
      setIsLoading(false);
      setError(false);
      return;
    }
    
    // Need to capture a new thumbnail
    const captureId = ++captureRequestRef.current;
    
    const captureThumbnail = async () => {
      setIsLoading(true);
      setError(false);
      
      try {
        // Find the slide element in the DOM
        // Look for the active slide container
        const slideContainer = document.querySelector(`[data-slide-id="${slide.id}"]`) as HTMLElement;
        
        if (!slideContainer) {
          console.warn(`Slide container not found for thumbnail: ${slide.id}`);
          setError(true);
          setIsLoading(false);
          return;
        }
        
        // Wait a bit for rendering to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if this capture request is still valid
        if (captureId !== captureRequestRef.current) {
          return; // A newer request has been made
        }
        
        // Capture the slide using html2canvas
        const canvas = await html2canvas(slideContainer, {
          scale: 0.5, // Reduce scale for smaller file size
          useCORS: true,
          allowTaint: true,
          backgroundColor: null, // Preserve transparency
          logging: false,
          width: 1920,
          height: 1080,
        });
        
        // Check again if this is still the current request
        if (captureId !== captureRequestRef.current) {
          return;
        }
        
        const dataUrl = canvas.toDataURL('image/png', 0.8);
        
        // Cache the thumbnail
        thumbnailCache.set(cacheKey, {
          dataUrl,
          timestamp: Date.now(),
          componentHash
        });
        
        setThumbnailUrl(dataUrl);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to capture thumbnail:', err);
        if (captureId === captureRequestRef.current) {
          setError(true);
          setIsLoading(false);
        }
      }
    };
    
    // Delay capture to allow slide to render first
    const timeoutId = setTimeout(() => {
      captureThumbnail();
    }, 150);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [slide.id, componentHash]);

  // If we have a thumbnail URL, show it
  if (thumbnailUrl && !isLoading) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded cursor-pointer transition-all w-full h-full",
          "hover:ring-2 hover:ring-primary/50",
          className
        )}
        onClick={onClick}
        style={{
          backgroundImage: `url(${thumbnailUrl})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: 'transparent'
        }}
      />
    );
  }

  // Show loading or fallback state
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded cursor-pointer transition-all w-full h-full",
        "hover:ring-2 hover:ring-primary/50 flex flex-col items-center justify-center",
        className
      )}
      onClick={onClick}
      style={{
        background: fallbackBackground
      }}
    >
      {isLoading && (
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      )}
      {error && (
        <>
          <Presentation className="h-10 w-10 text-primary/50 mb-2" />
          <p className="text-xs text-muted-foreground text-center line-clamp-2 px-2">
            {slide.title || 'Untitled Slide'}
          </p>
        </>
      )}
    </div>
  );
};

export default SimpleThumbnail;

// Export function to clear cache for a specific slide
export function clearThumbnailCache(slideId?: string) {
  if (slideId) {
    thumbnailCache.delete(slideId);
  } else {
    thumbnailCache.clear();
  }
}

// Export function to clear old cache entries (e.g., older than 1 hour)
export function cleanupThumbnailCache(maxAge: number = 3600000) {
  const now = Date.now();
  for (const [key, value] of thumbnailCache.entries()) {
    if (now - value.timestamp > maxAge) {
      thumbnailCache.delete(key);
    }
  }
}

