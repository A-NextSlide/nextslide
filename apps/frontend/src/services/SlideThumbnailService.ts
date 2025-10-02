import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';

interface ThumbnailCacheEntry {
  url: string;
  timestamp: number;
}

export const SlideThumbnailService = {
  // In-memory cache of thumbnails (kept for backward compatibility)
  thumbnailCache: new Map<string, ThumbnailCacheEntry>(),
  
  // Calculate cache key based on slide content
  getCacheKey(slide: SlideData): string {
    return `${slide.id}-${JSON.stringify(slide.components?.map(c => 
      `${c.id}-${c.props?.rotation || 0}-${c.props?.position?.x || 0}-${c.props?.position?.y || 0}`
    ))}`;
  },
  
  // Get thumbnail for a slide (from cache)
  getThumbnail(slide: SlideData): string | null {
    // Since we're using live miniature slides, this is deprecated
    return null;
  },
  
  async captureThumbnail(slide: SlideData, slideElement: HTMLElement): Promise<string> {
    // Deprecated - we now use live miniature slides
    console.warn("SlideThumbnailService.captureThumbnail is deprecated. Use MiniSlide component instead.");
    return this.createPlaceholderThumbnail(slide);
  },
  
  // Create a simple placeholder thumbnail when capture fails
  createPlaceholderThumbnail(slide: SlideData): string {
    try {
      const bgColor = slide.components?.find(c => c.type === "Background")?.props?.backgroundColor || '#ffffff';
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = 320;
      canvas.height = 180;
      
      if (ctx) {
        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add title text
        ctx.fillStyle = '#000000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(slide.title || 'Untitled Slide', canvas.width / 2, canvas.height / 2);
        
        // Draw a simple border
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }
      
      return canvas.toDataURL('image/png');
    } catch (error) {
      // Return empty string if placeholder creation fails
      return '';
    }
  },
  
  // Clear a specific thumbnail from cache
  clearThumbnail(slideId: string): void {
    // Deprecated - thumbnails are now live components
  },
  
  // Clear all thumbnails
  clearAllThumbnails(): void {
    this.thumbnailCache.clear();
    
    // Also clear chart thumbnails if they exist
    if (typeof window !== 'undefined' && (window as any).__chartThumbnailCache) {
      (window as any).__chartThumbnailCache = {};
    }
  },
  
  // Clear chart thumbnails for a specific slide
  clearChartThumbnails(slideId: string, components?: ComponentInstance[]): void {
    // If we have components, clear specific chart components
    if (components && Array.isArray(components) && typeof window !== 'undefined' && (window as any).__chartThumbnailCache) {
      // Find all chart components in this slide
      const chartComponents = components.filter(c => c.type === 'Chart');
      
      // Clear each chart from cache
      chartComponents.forEach(chart => {
        if ((window as any).__chartThumbnailCache && chart.id) {
          delete (window as any).__chartThumbnailCache[chart.id];
        }
      });
    } else if (typeof window !== 'undefined' && (window as any).__chartThumbnailCache) {
      // If no specific components provided, clear all chart thumbnails to be safe
      (window as any).__chartThumbnailCache = {};
    }
  }
};