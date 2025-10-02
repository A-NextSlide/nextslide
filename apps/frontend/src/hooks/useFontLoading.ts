import { useEffect, useState } from 'react';
import { FontLoadingService } from '../services/FontLoadingService';

/**
 * Hook to handle loading a font and tracking its loading state
 * @param fontFamily The font family to load
 * @returns Boolean indicating if the font has loaded
 */
export function useFontLoading(fontFamily: string): boolean {
  const [isLoaded, setIsLoaded] = useState(FontLoadingService.isFontLoaded(fontFamily));
  
  useEffect(() => {
    if (!isLoaded && fontFamily) {
      let mounted = true;
      
      FontLoadingService.loadFont(fontFamily).then(() => {
        if (mounted) {
          setIsLoaded(true);
        }
      });
      
      return () => { mounted = false; };
    }
  }, [fontFamily, isLoaded]);
  
  return isLoaded;
}
