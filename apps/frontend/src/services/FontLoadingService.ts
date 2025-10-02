import { FONT_CATEGORIES, FontDefinition, COMMON_FONTS } from '../registry/library/fonts';
import { designerFontsApi, chooseBestFile } from './designerFontsApi';
import { FontApiService } from './FontApiService';

// Track loaded fonts (using font name as key)
const loadedFonts = new Set<string>();
const loadingFonts = new Map<string, Promise<void>>();
// Style tag for dynamic font rules
let dynamicStyleTag: HTMLStyleElement | null = null;
// Track designer fonts sync
let designerFontsSynced = false;
let designerFontsSyncing: Promise<void> | null = null;

// Font priority tiers for optimized loading
const FONT_PRIORITY = {
  SYSTEM: 1,  // System fonts - loaded immediately
  COMMON: 2,  // Common web fonts - loaded proactively
  STANDARD: 3, // Standard fonts - loaded on demand with high priority
  DECORATIVE: 4, // Decorative fonts - loaded on demand with lower priority
};

// Define font priorities by category
const FONT_PRIORITY_MAP: Record<string, number> = {
  'System & Web Safe': FONT_PRIORITY.SYSTEM,
  'Awwwards Picks': FONT_PRIORITY.COMMON,
  'Designer': FONT_PRIORITY.COMMON,
  'Designer Local': FONT_PRIORITY.STANDARD,
  'PixelBuddha': FONT_PRIORITY.STANDARD,
  'Pixel & Retro Display': FONT_PRIORITY.STANDARD,
  'Premium': FONT_PRIORITY.COMMON,
  'Sans-Serif': FONT_PRIORITY.COMMON,
  'Serif': FONT_PRIORITY.COMMON,
  'Contemporary': FONT_PRIORITY.COMMON,
  'Variable': FONT_PRIORITY.COMMON,
  'Monospace': FONT_PRIORITY.STANDARD,
  'Design': FONT_PRIORITY.STANDARD,
  'Bold': FONT_PRIORITY.STANDARD,
  'Script': FONT_PRIORITY.DECORATIVE,
  'Elegant': FONT_PRIORITY.STANDARD,
  'Modern': FONT_PRIORITY.STANDARD,
  'Unique': FONT_PRIORITY.DECORATIVE,
};

// Track performance metrics for fonts
const fontPerformanceMetrics: Record<string, { loadTime: number, uses: number }> = {};

// Helper function to find FontDefinition by name (Restore this)
function findFontDefinition(fontName: string): FontDefinition | null {
  for (const category in FONT_CATEGORIES) {
    const fontDef = FONT_CATEGORIES[category].find(f => f.name === fontName);
    if (fontDef) {
      return fontDef;
    }
  }
  return null;
}

// Helper function to get or create the dynamic style tag (Restore this)
function getOrCreateDynamicStyleTag(): HTMLStyleElement {
  if (dynamicStyleTag && document.head.contains(dynamicStyleTag)) {
    return dynamicStyleTag;
  }
  dynamicStyleTag = document.createElement('style');
  dynamicStyleTag.id = 'dynamic-font-styles';
  document.head.appendChild(dynamicStyleTag);
  return dynamicStyleTag;
}

// Helper function to determine font priority based on its definition (Restore this)
function getFontPriority(fontDef: FontDefinition): number {
  if (fontDef.source === 'system') return FONT_PRIORITY.SYSTEM;
  if (COMMON_FONTS.includes(fontDef.name)) return FONT_PRIORITY.COMMON;

  for (const [category, priority] of Object.entries(FONT_PRIORITY_MAP)) {
     // Find which category the font belongs to
     if (FONT_CATEGORIES[category]?.some(f => f.name === fontDef.name)) {
         return priority;
     }
  }

  return FONT_PRIORITY.STANDARD; // Default priority
}

/**
 * Service to manage font loading on demand with performance optimizations
 * - Tracks loaded fonts to avoid duplicate loading
 * - Prioritizes fonts based on usage patterns
 * - Implements non-blocking loading strategies
 * - Provides performance metrics for loaded fonts
 */
export const FontLoadingService = {
  /**
   * Ensure designer fonts are merged into FONT_CATEGORIES dynamically.
   */
  syncDesignerFonts: async (): Promise<void> => {
    if (designerFontsSynced) return;
    if (designerFontsSyncing) return designerFontsSyncing;
    designerFontsSyncing = (async () => {
      try {
        // Load ALL backend fonts (PixelBuddha + Designer) via catalog for richer grouping
        const allBackendFonts = await FontApiService.listFonts(undefined, undefined, 1000, 0);

        const existingNames = new Set<string>(Object.values(FONT_CATEGORIES).flat().map(f => f.name));

        // Ensure categories exist for runtime injection
        const designerCat = FONT_CATEGORIES['Designer'] || (FONT_CATEGORIES['Designer'] = []);
        const pixelBuddhaCat = FONT_CATEGORIES['PixelBuddha'] || (FONT_CATEGORIES['PixelBuddha'] = []);

        for (const item of allBackendFonts) {
          const displayName = (item as any).name || (item as any).id;
          if (!displayName) continue;
          if (existingNames.has(displayName)) continue;

          const def: FontDefinition = {
            name: displayName,
            family: displayName,
            source: 'designer'
          } as any;
          // Attach id for backend loading
          (def as any).id = (item as any).id;

          // Add to appropriate category group(s)
          if ((item as any).source === 'pixelbuddha') {
            pixelBuddhaCat.push(def);
          }
          if ((item as any).source !== 'pixelbuddha') {
            designerCat.push(def);
          }
          existingNames.add(displayName);
        }
        designerFontsSynced = true;
      } catch (e) {
        // Non-fatal; leave as not synced
      } finally {
        designerFontsSyncing = null;
      }
    })();
    return designerFontsSyncing;
  },
  /**
   * Load a specific font on demand using its definition.
   */
  loadFont: async (fontName: string, priority?: number): Promise<void> => {
    // 1. Check cache and loading status
    if (loadedFonts.has(fontName)) {
      if (fontPerformanceMetrics[fontName]) fontPerformanceMetrics[fontName].uses++;
      return;
    }
    if (loadingFonts.has(fontName)) {
      return loadingFonts.get(fontName);
    }

    // 2. Find Font Definition
    const fontDef = findFontDefinition(fontName);
    if (!fontDef) {
      return Promise.resolve(); // Don't block if definition is missing
    }

    // 3. Handle System fonts
    if (fontDef.source === 'system') {
      loadedFonts.add(fontName);
      if (!fontPerformanceMetrics[fontName]) {
           fontPerformanceMetrics[fontName] = { loadTime: 0, uses: 1 };
      }
      return Promise.resolve();
    }

    // 4. Create loading promise
    const loadPromise = new Promise<void>(async (resolve) => {
      const startTime = performance.now();
      try {
        const styleTag = getOrCreateDynamicStyleTag();
        let cssToInject = '';
        // Special-case PixelBuddha: load via backend API by family name
        try {
          const pixelBuddhaGroup = FONT_CATEGORIES['PixelBuddha'] || [];
          const isPixelBuddhaFont = pixelBuddhaGroup.some(f => f.name === fontName);
          if (isPixelBuddhaFont) {
            const ok = await FontApiService.findAndLoadByFamily(fontDef.family || fontName, fontDef.weight || '400');
            if (ok) {
              loadedFonts.add(fontName);
              const loadTime = performance.now() - startTime;
              fontPerformanceMetrics[fontName] = { loadTime, uses: (fontPerformanceMetrics[fontName]?.uses || 0) + 1 };
              resolve();
              return;
            }
          }
        } catch {}

        // 5. Generate CSS based on source
        switch (fontDef.source) {
          case 'local':
            if (!fontDef.url) {
              throw new Error(`Local font ${fontName} missing URL`);
            }
            // Infer format from file extension
            const urlLower = fontDef.url.toLowerCase();
            let fmt = 'woff2';
            if (urlLower.endsWith('.woff2')) fmt = 'woff2';
            else if (urlLower.endsWith('.woff')) fmt = 'woff';
            else if (urlLower.endsWith('.otf')) fmt = 'opentype';
            else if (urlLower.endsWith('.ttf')) fmt = 'truetype';
            // Basic @font-face rule
            cssToInject = `
@font-face {
  font-family: "${fontDef.family}";
  src: url("${fontDef.url}") format("${fmt}");
  ${fontDef.weight ? `font-weight: ${fontDef.weight};` : ''}
  ${fontDef.style ? `font-style: ${fontDef.style};` : ''}
  font-display: swap;
}
`;
            break;

          case 'cdn':
            if (!fontDef.url) {
              throw new Error(`CDN font ${fontName} missing URL`);
            }
            // For CDN fonts, add a link tag; ensure id is unique per href
            const cdnLinkId = `cdn-font-${btoa(fontDef.url).replace(/=+/g, '')}`;
            if (!document.querySelector(`link#${cdnLinkId}`) && !document.querySelector(`link[href="${fontDef.url}"]`)) {
              const link = document.createElement('link');
              link.id = cdnLinkId;
              link.rel = 'stylesheet';
              link.href = fontDef.url;
              link.onload = () => {
                // CDN font stylesheet loaded
              };
              link.onerror = () => {
                console.error(`❌ Failed to load CDN font stylesheet: ${fontName}`);
              };
              document.head.appendChild(link);
            }
            break;

          case 'google':
             // Construct Google Font API URL
             let googleUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontDef.family)}`;
             const variants: string[] = [];
             const weights = String(fontDef.weight || '400').split(' ').map(w => w.trim()).filter(Boolean);
             
             // Handle variable fonts specially
             if (fontDef.style === 'variable') {
                 // For variable fonts, use the weight range format
                 if (weights.length >= 2) {
                     const minWeight = weights[0];
                     const maxWeight = weights[weights.length - 1];
                     googleUrl += `:wght@${minWeight}..${maxWeight}`;
                 } else {
                     // Fallback for variable fonts with single weight
                     googleUrl += `:wght@${weights[0] || '400'}`;
                 }
             } else {
                 // Regular font handling
                 // Determine which styles to load based on font capabilities
                 let styles: string[] = [];
                 if (fontDef.style === 'italic') {
                     styles = ['1']; // Only italic
                 } else if (fontDef.style === 'normal') {
                     styles = ['0']; // Only normal
                 } else {
                     // Check if font supports italic before loading both styles
                     const { fontSupportsItalic } = await import('../utils/fontCapabilities');
                     const supportsItalic = fontSupportsItalic(fontDef.name);
                     styles = supportsItalic ? ['0', '1'] : ['0']; // Only load italic if supported
                 }
     
                 // Create proper weight-style combinations
                 styles.forEach(style => {
                     weights.forEach(weight => {
                         variants.push(`${style},${weight}`);
                     });
                 });
                 
                 if(variants.length > 0) {
                     googleUrl += `:ital,wght@${variants.join(';')}`;
                 }
             }
             googleUrl += '&display=swap';
 
             // Check if this stylesheet link already exists
             if (!document.querySelector(`link[href="${googleUrl}"]`)) {
                 // Create and append the <link> tag
                 const link = document.createElement('link');
                 link.rel = 'stylesheet';
                 link.href = googleUrl;
                 link.onload = () => {
                   // Font stylesheet loaded successfully
                 };
                                link.onerror = () => {
                 // Google Font failed to load
               };
                 document.head.appendChild(link);
                 // Loading Google Font
                 // Font styles and weights configured
             } else {
                 // Google Font stylesheet already exists
             }
             break;

          case 'fontshare':
            // For Fontshare fonts, we need to use the exact family name from the definition
            let fontshareUrl = `https://api.fontshare.com/v2/css?f[]=${encodeURIComponent(fontDef.family)}`;
            const fsWeights = String(fontDef.weight || '400').split(' ').map(w => w.trim()).filter(Boolean);
            if (fsWeights.length > 0) {
                 fontshareUrl += `@${fsWeights.join(',')}`;
            }
            fontshareUrl += '&display=swap';
            
            // Use link tag instead of fetch to avoid CORS issues
            const fontshareId = `fontshare-${fontDef.family.replace(/\s+/g, '-').toLowerCase()}`;
            if (!document.querySelector(`link#${fontshareId}`)) {
              const link = document.createElement('link');
              link.id = fontshareId;
              link.rel = 'stylesheet';
              link.href = fontshareUrl;
              link.onload = () => {
                // Font loaded successfully
              };
                              link.onerror = () => {
                  // Font failed to load
                };
              document.head.appendChild(link);
            }
            break;

          case 'designer':
            try {
              // Attempt optimal path: details -> pick woff2 -> FontFace
              // @ts-ignore
              const fontId: string | undefined = (fontDef as any).id;
              if (fontId) {
                const details = await designerFontsApi.details(fontId);
                // Find a regular style if available
                const allStyleFiles = (details.styles || []).flatMap(s => s.files.map(f => ({ style: s.style, file: f })));
                let picked = allStyleFiles.find(sf => sf.style.toLowerCase() === 'regular');
                if (!picked && allStyleFiles.length > 0) picked = allStyleFiles[0];
                if (picked) {
                  const best = chooseBestFile([picked.file]);
                  if (best) {
                    const url = best.format?.toLowerCase() === 'woff2'
                      ? designerFontsApi.designerFileUrl(fontId, best.filename)
                      : designerFontsApi.designerFileUrl(fontId, best.filename);
                    const formatSuffix = best.format ? ` format('${best.format.toLowerCase()}')` : '';
                    const face = new FontFace(fontDef.family, `url(${url})${formatSuffix}`);
                    await face.load();
                    document.fonts.add(face);
                    break;
                  }
                }
              }
              // Fallback quick path: use style endpoint for regular
              if (fontId) {
                const url = designerFontsApi.fileUrlByStyle(fontId, 'regular');
                const css = `\n@font-face {\n  font-family: "${fontDef.family}";\n  src: url("${url}");\n  font-weight: 400;\n  font-style: normal;\n  font-display: swap;\n}\n`;
                const styleTag = getOrCreateDynamicStyleTag();
                if (!styleTag.textContent?.includes(url)) {
                  styleTag.textContent += css;
                }
              }
            } catch (e) {
              // ignore and proceed; readiness check will handle
            }
            break;
        }

        // 6. Inject CSS if not already present (Only for non-google sources now)
        if (fontDef.source !== 'google' && fontDef.source !== 'cdn' && fontDef.source !== 'fontshare') {
          if (cssToInject && !styleTag.textContent?.includes(cssToInject)) {
             styleTag.textContent += cssToInject;
          }
        }

        // 7. Use Font Loading API to check readiness
        const fontStyle = fontDef.style === 'variable' ? 'normal' : (fontDef.style || 'normal');
        // If weight range or multiple weights, check common 400 to validate availability
        const fontWeight = (fontDef.style === 'variable' || (fontDef.weight && /\s|\d\s\d/.test(String(fontDef.weight)))) ? '400' : (fontDef.weight ? String(fontDef.weight).split(' ')[0] : '400');
        const fontLoadString = `${fontStyle} ${fontWeight} 1em "${fontDef.family}"`;
        
        // For Fontshare fonts, we need to wait a bit for the stylesheet to load
        if (fontDef.source === 'fontshare') {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const fontCheckPromise = 'fonts' in document ? document.fonts.load(fontLoadString) : Promise.resolve([null]);

        // 8. Set timeout and race
        const currentPriority = priority || getFontPriority(fontDef); // Use definition here
        const timeoutMs = currentPriority <= FONT_PRIORITY.COMMON ? 3000 : 5000; 

        try {
          await Promise.race([
            fontCheckPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), timeoutMs))
          ]);
          
          // Additional verification for Google fonts
          if (fontDef.source === 'google' && 'fonts' in document) {
            // Give it a moment for the stylesheet to be processed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if font is actually ready
            const isReady = document.fonts.check(fontLoadString);
            if (!isReady) {
              // Font may still be loading
            }
          }
        } catch (e) {
          // Continue anyway - the font might still load, but the readiness check timed out
          // Font loading check might fail but font could still load
        }

        // 9. Mark as loaded and record metrics on success
        loadedFonts.add(fontName);
        const loadTime = performance.now() - startTime;
        fontPerformanceMetrics[fontName] = { loadTime, uses: (fontPerformanceMetrics[fontName]?.uses || 0) + 1 };
        import('../utils/performanceMonitor').then(m => m.recordFontMetric(fontName, loadTime)).catch(()=>{});
        resolve();

      } catch (error: any) {        
        // Do NOT mark as loaded on error; record failure only
        if (!fontPerformanceMetrics[fontName]) {
          fontPerformanceMetrics[fontName] = { loadTime: -1, uses: 1 }; // Indicate error
        }
        resolve(); // Resolve anyway so the app doesn't hang
      }
    });

    loadingFonts.set(fontName, loadPromise);

    loadPromise.finally(() => {
      loadingFonts.delete(fontName);
    });

    return loadPromise;
  },

  /**
   * Load a batch of fonts with smart throttling
   */
  loadFonts: async (fonts: string[] | FontDefinition[], options?: { 
    maxConcurrent?: number; 
    delayBetweenBatches?: number;
    useIdleCallback?: boolean;
  }): Promise<void> => {
    if (!fonts.length) return;

    const { 
      maxConcurrent = 3, 
      delayBetweenBatches = 100,
      useIdleCallback = true 
    } = options || {};

    const fontNames = fonts.map(font => typeof font === 'string' ? font : font.name);

    // Find definitions for names - handle potential nulls
    const definitions = fontNames.map(findFontDefinition).filter((def): def is FontDefinition => !!def);
    if (!definitions.length) return;

    const definitionsToLoad = definitions.filter(def => !loadedFonts.has(def.name));
    if (!definitionsToLoad.length) return;

    const sortedDefs = definitionsToLoad.sort((a, b) => getFontPriority(a) - getFontPriority(b));

    // Load in batches to avoid overwhelming the browser
    const batches: FontDefinition[][] = [];
    for (let i = 0; i < sortedDefs.length; i += maxConcurrent) {
      batches.push(sortedDefs.slice(i, i + maxConcurrent));
    }

    // Load batches with delays
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      const loadBatch = () => {
        return Promise.all(batch.map(def => FontLoadingService.loadFont(def.name)));
      };

      if (useIdleCallback && i > 0 && 'requestIdleCallback' in window) {
        // Use idle callback for non-critical batches
        await new Promise<void>((resolve) => {
          window.requestIdleCallback(() => {
            loadBatch().finally(() => resolve());
          });
        });
      } else {
        await loadBatch();
      }

      // Add delay between batches (except for the last one)
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  },

  /**
   * Preload system and common fonts with enhanced font coverage
   */
  preloadSystemFonts: async (): Promise<void> => {
    // First load system fonts immediately
    const systemFontDefs = FONT_CATEGORIES['System & Web Safe'] || [];
    await FontLoadingService.loadFonts(systemFontDefs);

    // Then load common fonts shortly after, plus curated designer set
    setTimeout(() => {
      const curatedDesigner = (FONT_CATEGORIES['Designer'] || []).map(f => f.name);
      FontLoadingService.loadFonts([...COMMON_FONTS, ...curatedDesigner]);
    }, 300);

    // Load a broader selection of fonts slightly later
    setTimeout(() => {
        // Load designer-curated picks prominently
        const awwwardsNames = (FONT_CATEGORIES['Awwwards Picks'] || []).map(f => f.name);
        // Load ALL premium fonts immediately since they're high quality
        const premiumNames = (FONT_CATEGORIES['Premium'] || []).map(f => f.name);
        const sansSerifNames = (FONT_CATEGORIES['Sans-Serif'] || []).slice(0, 8).map(f => f.name);
        const serifNames = (FONT_CATEGORIES['Serif'] || []).slice(0, 8).map(f => f.name);
        // Load ALL contemporary fonts since they're trending
        const contemporaryNames = (FONT_CATEGORIES['Contemporary'] || []).map(f => f.name);
        // Load variable fonts for better performance
        const variableNames = (FONT_CATEGORIES['Variable'] || []).slice(0, 3).map(f => f.name);
        // Load ALL monospace fonts
        const monoNames = (FONT_CATEGORIES['Monospace'] || []).map(f => f.name);
        const boldNames = (FONT_CATEGORIES['Bold'] || []).slice(0, 8).map(f => f.name);
        // Load ALL Design fonts since they're commonly used
        const designNames = (FONT_CATEGORIES['Design'] || []).slice(0, 15).map(f => f.name);
        // Load popular script fonts
        const scriptNames = (FONT_CATEGORIES['Script'] || []).slice(0, 8).map(f => f.name);
        // Load elegant fonts
        const elegantNames = (FONT_CATEGORIES['Elegant'] || []).slice(0, 8).map(f => f.name);
        // De-emphasize Modern fonts; load fewer
        const modernNames = (FONT_CATEGORIES['Modern'] || []).slice(0, 4).map(f => f.name);
        
        // Load all these font categories together (Designer Local loads lazily via picker)
        FontLoadingService.loadFonts([
          ...awwwardsNames,
          ...premiumNames,
          ...sansSerifNames, 
          ...serifNames,
          ...contemporaryNames,
          ...variableNames,
          ...monoNames,
          ...boldNames,
          ...designNames,
          ...scriptNames,
          ...elegantNames,
          ...modernNames
        ]);
    }, 1000); 
  },

  /**
   * Prepare fonts for editing. (Restore correct signature)
   */
  prepareForEditing: async (usedFontNames: string[]): Promise<void> => {
    if (usedFontNames.length) {
      await FontLoadingService.loadFonts(usedFontNames);
    }
    // Load all Design fonts immediately since they're commonly used
    const designFontNames = (FONT_CATEGORIES['Design'] || []).map(f => f.name);
    FontLoadingService.loadFonts(designFontNames, { maxConcurrent: 2, delayBetweenBatches: 200 });
  },

  getFontPerformanceMetrics: () => {
    return { ...fontPerformanceMetrics };
  },

  isFontLoaded: (fontName: string): boolean => {
    return loadedFonts.has(fontName);
  },

  getLoadedFonts: (): string[] => {
    return Array.from(loadedFonts);
  },

  /**
   * Get all available font names (for UI dropdowns)
   */
  getAllFontNames: (): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const def of Object.values(FONT_CATEGORIES).flat()) {
      const key = def.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(def.name);
      }
    }
    return result;
  },

  /**
   * Get all font categories mapped to font names (for grouped dropdowns)
   */
  getFontCategories: (): Record<string, string[]> => {
     return Object.entries(FONT_CATEGORIES).reduce((acc, [category, fonts]) => {
        acc[category] = fonts.map(font => font.name);
        return acc;
     }, {} as Record<string, string[]>);
  },

  /**
   * Get de-duplicated font groups using priority order similar to registry.
   */
  getDedupedFontGroups: (): Record<string, string[]> => {
    const priorityOrder = [
      'Awwwards Picks',
      'Designer',
      'PixelBuddha',
      'Designer Local',
      'System & Web Safe',
      'Premium',
      'Sans-Serif',
      'Serif',
      'Design',
      'Contemporary',
      'Variable',
      'Monospace',
      'Elegant',
      'Bold',
      'Modern',
      'Unique',
      'Editorial',
      'Geometric',
      'Tech & Startup',
      'Luxury',
      'Retro',
      'Pixel & Retro Display',
      'Branding'
    ];
    const seen = new Set<string>();
    const result: Record<string, string[]> = {};
    for (const category of priorityOrder) {
      const defs = FONT_CATEGORIES[category] || [];
      for (const def of defs) {
        const key = def.name.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          if (!result[category]) result[category] = [];
          result[category].push(def.name);
        }
      }
    }
    return result;
  },

  /**
   * Preload fonts for dropdown opening - smart loading strategy
   */
  preloadForDropdown: async (categories: Record<string, string[]>, activeTab?: string): Promise<void> => {
    // 1. Load system fonts immediately (always available)
    const systemFonts = categories['System & Web Safe'] || [];
    await FontLoadingService.loadFonts(systemFonts, { maxConcurrent: 5, delayBetweenBatches: 0 });

    // 2. Load active tab fonts immediately
    if (activeTab && categories[activeTab]) {
      await FontLoadingService.loadFonts(categories[activeTab], { maxConcurrent: 3, delayBetweenBatches: 50 });
    }

    // 3. Load common fonts (Sans-Serif) with priority
    const sansFonts = (categories['Sans-Serif'] || []).slice(0, 8); // Limit to first 8
    FontLoadingService.loadFonts(sansFonts, { maxConcurrent: 2, delayBetweenBatches: 100, useIdleCallback: true });

    // 4. Load other categories progressively
    const otherCategories = Object.keys(categories).filter(cat => 
      cat !== 'System & Web Safe' && 
      cat !== 'Sans-Serif' && 
      cat !== activeTab
    );

    otherCategories.forEach((category, index) => {
      setTimeout(() => {
        const fonts = categories[category] || [];
        FontLoadingService.loadFonts(fonts, { 
          maxConcurrent: 2, 
          delayBetweenBatches: 200, 
          useIdleCallback: true 
        });
      }, (index + 1) * 1000); // Stagger by 1 second
    });
  },

  /**
   * Get loading statistics for debugging
   */
  getLoadingStats: () => {
    const totalFonts = Object.values(FONT_CATEGORIES).flat().length;
    const loadedCount = loadedFonts.size;
    const loadingCount = loadingFonts.size;
    
    return {
      totalFonts,
      loadedCount,
      loadingCount,
      loadedPercentage: Math.round((loadedCount / totalFonts) * 100),
      loadedFonts: Array.from(loadedFonts),
      performanceMetrics: { ...fontPerformanceMetrics }
    };
  },

  /**
   * Debug method to manually test problematic fonts
   */
  debugProblematicFonts: async () => {
    const problematicFonts = ['Comfortaa', 'Quicksand', 'Josefin Sans', 'Cabin', 'Barlow', 'Varela Round'];
    // Testing problematic fonts...
    
    for (const fontName of problematicFonts) {
      // Testing font...
      try {
        await FontLoadingService.loadFont(fontName);
        // Font loaded successfully
      } catch (error) {
        console.error(`❌ ${fontName} failed:`, error);
      }
    }
    
    // Final stats available via getLoadingStats()
  }
};

// Ensure getFontPriority helper is defined *after* FONT_CATEGORIES is fully defined if there were hoisting issues.
// (Definition moved earlier, should be fine)