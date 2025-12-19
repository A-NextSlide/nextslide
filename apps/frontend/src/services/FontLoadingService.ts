import { FONT_CATEGORIES, FontDefinition, COMMON_FONTS } from '../registry/library/fonts';
import { FontApiService } from './FontApiService';

// Track loaded fonts (using font name as key)
const loadedFonts = new Set<string>();
const loadingFonts = new Map<string, Promise<void>>();
// Style tag for dynamic font rules
let dynamicStyleTag: HTMLStyleElement | null = null;
// Track designer fonts sync
let designerFontsSynced = false;
let designerFontsSyncing: Promise<void> | null = null;
const backendFontByName = new Map<string, FontDefinition & { id?: string; category?: string; tags?: string[] }>();
let backendFontGroups: Record<string, string[]> | null = null;
let backendSourceGroups: Record<string, string[]> | null = null;
let backendFontNames: string[] | null = null;

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
  const key = fontName.trim().toLowerCase();
  const backendDef = backendFontByName.get(key);
  if (backendDef) {
    return backendDef;
  }
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

function normalizeBackendCategory(category?: string): string {
  const cat = (category || '').toLowerCase();
  if (cat.includes('mono')) return 'Monospace';
  if (cat.includes('script') || cat.includes('hand')) return 'Script';
  if (cat.includes('slab')) return 'Slab';
  if (cat.includes('serif') && !cat.includes('sans')) return 'Serif';
  if (cat.includes('sans')) return 'Sans-Serif';
  if (cat.includes('display') || cat.includes('headline') || cat.includes('decorative')) return 'Display';
  return 'Other';
}

function buildBackendFontGroups(fonts: Iterable<FontDefinition & { category?: string; source?: string }>): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const seen = new Set<string>();

  const featuredFonts = (FONT_CATEGORIES['Awwwards Picks'] || []).map(font => font.name);
  if (featuredFonts.length) {
    const featuredAvailable = featuredFonts.filter(name => {
      const key = name.toLowerCase();
      return backendFontByName.has(key);
    });
    if (featuredAvailable.length) {
      groups['Featured'] = featuredAvailable;
      featuredAvailable.forEach(name => seen.add(name.toLowerCase()));
    }
  }

  const systemFonts = (FONT_CATEGORIES['System & Web Safe'] || []).map(f => f.name);
  if (systemFonts.length) {
    groups['System & Web Safe'] = systemFonts;
    systemFonts.forEach(name => seen.add(name.toLowerCase()));
  }

  for (const def of fonts) {
    const name = def.name;
    if (!name) continue;
    const key = name.toLowerCase();
    const category = normalizeBackendCategory((def as any).category);
    if (category) {
      if (!groups[category]) groups[category] = [];
      if (!groups[category].includes(name)) {
        groups[category].push(name);
      }
    }
  }

  Object.keys(groups).forEach(group => {
    groups[group] = groups[group].slice().sort((a, b) => a.localeCompare(b));
  });

  return groups;
}

function normalizeSourceGroup(source?: string): string {
  const src = (source || '').toLowerCase();
  if (src === 'pixelbuddha') return 'PixelBuddha';
  if (src === 'designer' || src === 'local') return 'Designer';
  if (src === 'google') return 'Google Fonts';
  if (src === 'fontshare') return 'Fontshare';
  if (src === 'cdn') return 'CDN';
  if (src === 'system') return 'System & Web Safe';
  return 'Other';
}

function buildBackendSourceGroups(fonts: Iterable<FontDefinition & { source?: string }>): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const def of fonts) {
    const name = def.name;
    if (!name) continue;
    const group = normalizeSourceGroup((def as any).source);
    if (!groups[group]) groups[group] = [];
    if (!groups[group].includes(name)) {
      groups[group].push(name);
    }
    seen.add(name.toLowerCase());
  }

  const systemFonts = (FONT_CATEGORIES['System & Web Safe'] || []).map(f => f.name);
  if (systemFonts.length) {
    if (!groups['System & Web Safe']) groups['System & Web Safe'] = [];
    systemFonts.forEach(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      groups['System & Web Safe'].push(name);
      seen.add(key);
    });
  }

  Object.keys(groups).forEach(group => {
    groups[group] = groups[group].slice().sort((a, b) => a.localeCompare(b));
  });

  return groups;
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
   * Sync backend font catalog for dropdowns and on-demand loading.
   * Loads metadata only; actual font files are fetched on demand.
   */
  syncDesignerFonts: async (): Promise<void> => {
    if (designerFontsSynced) return;
    if (designerFontsSyncing) return designerFontsSyncing;
    designerFontsSyncing = (async () => {
      try {
        const allBackendFonts = await FontApiService.listFonts(undefined, undefined, 5000, 0, false);

        backendFontByName.clear();
        for (const item of allBackendFonts) {
          const displayName = (item as any).name || (item as any).id;
          if (!displayName) continue;
          const def: FontDefinition = {
            name: displayName,
            family: displayName,
            source: (item as any).source || 'designer'
          } as any;

          (def as any).id = (item as any).id;
          (def as any).category = (item as any).category;
          (def as any).tags = (item as any).tags || [];

          backendFontByName.set(displayName.toLowerCase(), def);
        }

        backendFontNames = Array.from(backendFontByName.values()).map(def => def.name).sort((a, b) => a.localeCompare(b));
        backendFontGroups = buildBackendFontGroups(backendFontByName.values());
        backendSourceGroups = buildBackendSourceGroups(backendFontByName.values());
        designerFontsSynced = true;
      } catch (e) {
        console.error('[FontLoadingService] Failed to sync designer fonts:', e);
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
      // Font not in frontend registry - try loading from backend as fallback
      // This handles PixelBuddha and other backend fonts not in FONT_CATEGORIES
      const loadPromiseFallback = (async () => {
        try {
          // Try loading via FontApiService (backend fonts)
          const loaded = await FontApiService.findAndLoadByFamily(fontName, '400');
          if (loaded) {
            loadedFonts.add(fontName);
            return;
          }
        } catch (error) {
          console.error(`[FontLoadingService] ✗ Failed to load backend font ${fontName}:`, error);
        }
      })();

      loadingFonts.set(fontName, loadPromiseFallback);
      loadPromiseFallback.finally(() => loadingFonts.delete(fontName));
      return loadPromiseFallback;
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

              if (variants.length > 0) {
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

          case 'pixelbuddha':
          case 'designer': {
            try {
              const fontId: string | undefined = (fontDef as any).id;
              if (fontId) {
                const ok = await FontApiService.loadFontById(fontId, fontDef.family, fontDef.weight || '400');
                if (ok) break;
              }
              await FontApiService.findAndLoadByFamily(fontDef.family, fontDef.weight || '400');
            } catch (e) {
              // ignore and proceed; readiness check will handle
            }
            break;
          }
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
        import('../utils/performanceMonitor').then(m => m.recordFontMetric(fontName, loadTime)).catch(() => { });
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
   * Load fonts selected by theme generation (hero + body) on-demand.
   * This is called when a theme is generated to ensure fonts are ready for rendering.
   * PERFORMANCE: Only loads the 2-3 fonts actually used in the theme.
   */
  loadThemeFonts: async (heroFont: string, bodyFont: string): Promise<void> => {
    try {
      // Load both fonts in parallel for better performance
      await Promise.all([
        FontApiService.findAndLoadByFamily(heroFont, '700'),  // Hero fonts typically bold
        FontApiService.findAndLoadByFamily(bodyFont, '400')   // Body fonts typically regular
      ]);
    } catch (error) {
      console.warn(`[FontLoadingService] Failed to load theme fonts:`, error);
      // Non-fatal - fonts will load on first render
    }
  },

  /**
   * Preload system and common fonts with enhanced font coverage.
   * TIER 1 (Immediate): System fonts only
   * TIER 2 (300ms delay): Common web fonts
   * TIER 3 (On-demand): Specialty fonts loaded when selected by theme generator
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
    if (backendFontNames && backendFontNames.length) {
      return backendFontNames.slice();
    }
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
    if (backendFontGroups) {
      return { ...backendFontGroups };
    }
    return Object.entries(FONT_CATEGORIES).reduce((acc, [category, fonts]) => {
      acc[category] = fonts.map(font => font.name);
      return acc;
    }, {} as Record<string, string[]>);
  },

  /**
   * Get font groups by source (PixelBuddha, Designer, Google, etc.)
   */
  getFontSourceGroups: (): Record<string, string[]> => {
    if (backendSourceGroups) {
      return { ...backendSourceGroups };
    }

    const groups: Record<string, string[]> = {};
    for (const fonts of Object.values(FONT_CATEGORIES)) {
      fonts.forEach((def) => {
        const group = normalizeSourceGroup(def.source);
        if (!groups[group]) groups[group] = [];
        if (!groups[group].includes(def.name)) {
          groups[group].push(def.name);
        }
      });
    }

    Object.keys(groups).forEach(group => {
      groups[group] = groups[group].slice().sort((a, b) => a.localeCompare(b));
    });

    return groups;
  },
  /**
   * Check if designer fonts have been synced
   */
  isDesignerFontsSynced: (): boolean => {
    return designerFontsSynced;
  },

  /**
   * Get de-duplicated font groups using priority order similar to registry.
   */
  getDedupedFontGroups: (): Record<string, string[]> => {
    if (backendFontGroups) {
      return { ...backendFontGroups };
    }
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
    const previewLimit = 24;
    // 1. Load system fonts immediately (always available)
    const systemFonts = categories['System & Web Safe'] || [];
    await FontLoadingService.loadFonts(systemFonts, { maxConcurrent: 5, delayBetweenBatches: 0 });

    // 2. Load active tab fonts immediately
    if (activeTab && categories[activeTab]) {
      await FontLoadingService.loadFonts(categories[activeTab].slice(0, previewLimit), {
        maxConcurrent: 3,
        delayBetweenBatches: 50
      });
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
        const fonts = (categories[category] || []).slice(0, previewLimit);
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
  },

  /**
   * Get font definition by name (for passing to iframe injection)
   */
  getFontDefinition: (fontName: string): FontDefinition | null => {
    return findFontDefinition(fontName);
  }
};

// Ensure getFontPriority helper is defined *after* FONT_CATEGORIES is fully defined if there were hoisting issues.
// (Definition moved earlier, should be fine)
