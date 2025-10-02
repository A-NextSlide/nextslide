import React, { useEffect, useState } from 'react';
import { FontLoadingService } from '../services/FontLoadingService';
import { preloadFontCategories, createFontPreloadLinks } from '../utils/fontLoaderUtils';

/**
 * FontPreloader component that implements an optimized font loading strategy
 * 1. Only loads system fonts on initial load
 * 2. Core fonts are loaded with Web Font API for controlled loading
 * 3. Other fonts are loaded on demand
 * 4. Uses performance metrics to track font load times
 */
const FontPreloader: React.FC = () => {
  const [systemFontsLoaded, setSystemFontsLoaded] = useState(false);
  
  // Disabled preload links to avoid browser warnings
  // useEffect(() => {
  //   const preloadLinks = createFontPreloadLinks();
  //   preloadLinks.forEach(link => document.head.appendChild(link));
  //   
  //   // Clean up links when component unmounts
  //   return () => {
  //     preloadLinks.forEach(link => {
  //       if (document.head.contains(link)) {
  //         document.head.removeChild(link);
  //       }
  //     });
  //   };
  // }, []);
  
  // Initialize font loading strategy
  useEffect(() => {
    // Disable system fonts only mode
    if (typeof window !== 'undefined') {
      // Set flag to indicate we're NOT in system fonts only mode
      (window as any).__systemFontsOnlyMode = false;
    }
    
    // Font loading code
    const initializeFonts = async () => {
      try {
        // Step 1: Preload only system & web safe fonts (most critical)
        // This will happen regardless of what fonts are in the deck
        await FontLoadingService.preloadSystemFonts();
        setSystemFontsLoaded(true);
        
        // Step 2: After system fonts are loaded, preload essential font categories
        // These will load even if they're not used in the deck - common fonts only
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            // Load only when the user isn't interacting
            if (!(window as any).__isDragging) {
              // Preload multiple font categories at once including system fonts
              // Note: Specific deck fonts are now loaded by DeckStoreInitializer
              preloadFontCategories(['sans-serif', 'serif', 'monospace', 'system', 'fontshare']).catch(() => {});
            }
          });
        }
      } catch (error) {
        setSystemFontsLoaded(true);
      }
    };
    
    initializeFonts();
    
    // Timer for metrics collection (disabled to reduce console logs)
    // const metricsTimer = setTimeout(() => {
    //   const loadedFonts = FontLoadingService.getLoadedFonts();
    //   console.log(`[FontPreloader] ${loadedFonts.length} fonts loaded`);
    // }, 10000);
    
    // return () => clearTimeout(metricsTimer);
  }, []);
  
  // Render a small selection of system fonts to preload them visually
  return (
    <div 
      aria-hidden="true" 
      className="font-preloader" 
      style={{ 
        position: 'absolute',
        top: -9999,
        left: -9999,
        visibility: 'hidden', 
        pointerEvents: 'none',
        width: 0,
        height: 0,
        overflow: 'hidden',
        opacity: 0
      }}
    >
      {/* Render only system fonts in the DOM */}
      <span style={{ fontFamily: 'Arial' }}>Arial</span>
      <span style={{ fontFamily: 'Helvetica' }}>Helvetica</span>
      <span style={{ fontFamily: 'Times New Roman' }}>Times New Roman</span>
      <span style={{ fontFamily: 'Georgia' }}>Georgia</span>
      <span style={{ fontFamily: 'Courier New' }}>Courier New</span>
      <span style={{ fontFamily: 'Roboto' }}>Roboto</span>
      <span style={{ fontFamily: 'Inter' }}>Inter</span>
      <span style={{ fontFamily: 'system-ui' }}>System UI</span>
      <span style={{ fontFamily: 'Palatino' }}>Palatino</span>
      <span style={{ fontFamily: 'Lucida Sans' }}>Lucida Sans</span>
      <span style={{ fontFamily: 'Segoe UI' }}>Segoe UI</span>
      <span style={{ fontFamily: 'SF Pro Text' }}>SF Pro Text</span>
    </div>
  );
};

export default FontPreloader;