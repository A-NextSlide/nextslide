/**
 * Font Measurement Utility
 *
 * Measures character width ratios for fonts in the browser.
 * This is more accurate than backend measurement since fonts are actually loaded.
 */

/**
 * Measure the character width ratio for a font.
 * This ratio is used by the backend for text sizing calculations.
 *
 * Formula: (average character width) / (font size)
 *
 * @param fontFamily - Font family name to measure
 * @param fontSize - Font size to measure at (default: 24px for consistency)
 * @returns Character width ratio (typically 0.4-0.7)
 */
export function measureCharWidthRatio(
  fontFamily: string,
  fontSize: number = 24
): number {
  try {
    // Create a temporary canvas for measurement
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.warn('Failed to get canvas context for font measurement');
      return 0.55; // Default fallback
    }

    // Set font
    ctx.font = `${fontSize}px "${fontFamily}"`;

    // Sample text - representative of typical content
    const sampleText = 'The quick brown fox jumps over the lazy dog 0123456789';

    // Measure text width
    const metrics = ctx.measureText(sampleText);
    const textWidth = metrics.width;

    // Calculate ratio: (width / char_count) / font_size
    const charCount = sampleText.length;
    const avgCharWidth = textWidth / charCount;
    const ratio = avgCharWidth / fontSize;

    // Sanity check: ratios should be between 0.3 and 0.8 for real fonts
    if (ratio < 0.3 || ratio > 0.8) {
      console.warn(
        `Suspicious ratio ${ratio.toFixed(3)} for '${fontFamily}' - font may not be loaded`,
        'Using default 0.55'
      );
      return 0.55;
    }

    return ratio;
  } catch (error) {
    console.error(`Failed to measure font ${fontFamily}:`, error);
    return 0.55; // Default fallback
  }
}

/**
 * Measure character width ratios for multiple fonts.
 * Useful for batch measurement when theme is generated.
 *
 * @param fontFamilies - Array of font family names
 * @returns Map of font family to character width ratio
 */
export function measureMultipleFonts(
  fontFamilies: string[]
): Record<string, number> {
  const measurements: Record<string, number> = {};

  for (const fontFamily of fontFamilies) {
    measurements[fontFamily] = measureCharWidthRatio(fontFamily);
  }

  return measurements;
}

/**
 * Wait for a font to be loaded before measuring.
 * Uses the Font Loading API to ensure font is ready.
 *
 * @param fontFamily - Font family name
 * @param timeout - Maximum time to wait in ms (default: 3000)
 * @returns Promise that resolves when font is loaded
 */
export async function waitForFontLoad(
  fontFamily: string,
  timeout: number = 3000
): Promise<boolean> {
  if (!('fonts' in document)) {
    // Font Loading API not supported, assume font is loaded
    return true;
  }

  try {
    // Check if font is already loaded
    const fontString = `16px "${fontFamily}"`;
    if (document.fonts.check(fontString)) {
      return true;
    }

    // Load the font with timeout
    const loadPromise = document.fonts.load(fontString);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Font load timeout')), timeout)
    );

    await Promise.race([loadPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.warn(`Font ${fontFamily} may not be fully loaded:`, error);
    return false;
  }
}

/**
 * Measure a font after ensuring it's loaded.
 * This is the recommended way to measure fonts.
 *
 * @param fontFamily - Font family name
 * @param fontSize - Font size to measure at
 * @returns Promise resolving to character width ratio
 */
export async function measureFontWhenReady(
  fontFamily: string,
  fontSize: number = 24
): Promise<number> {
  // Wait for font to load
  await waitForFontLoad(fontFamily);

  // Small delay to ensure rendering is complete
  await new Promise(resolve => setTimeout(resolve, 50));

  // Measure the font
  return measureCharWidthRatio(fontFamily, fontSize);
}

/**
 * Measure fonts used in a theme and add ratios to typography objects.
 * This enriches the theme with measured data before sending to backend.
 *
 * @param theme - Theme object with typography
 * @returns Theme with charWidthRatio added to typography
 */
export async function enrichThemeWithFontMetrics(
  theme: any
): Promise<any> {
  if (!theme?.typography) {
    return theme;
  }

  const enrichedTheme = { ...theme };
  const typography = { ...enrichedTheme.typography };

  // Measure heading/hero font
  const heading = typography.heading || typography.hero_title;
  if (heading?.fontFamily || heading?.family) {
    const fontFamily = heading.fontFamily || heading.family;
    const ratio = await measureFontWhenReady(fontFamily);

    if (typography.heading) {
      typography.heading = { ...heading, charWidthRatio: ratio };
    }
    if (typography.hero_title) {
      typography.hero_title = { ...heading, charWidthRatio: ratio };
    }

    console.log(`📏 Measured ${fontFamily} (heading): ${ratio.toFixed(3)}`);
  }

  // Measure paragraph/body font
  const paragraph = typography.paragraph || typography.body_text;
  if (paragraph?.fontFamily || paragraph?.family) {
    const fontFamily = paragraph.fontFamily || paragraph.family;
    const ratio = await measureFontWhenReady(fontFamily);

    if (typography.paragraph) {
      typography.paragraph = { ...paragraph, charWidthRatio: ratio };
    }
    if (typography.body_text) {
      typography.body_text = { ...paragraph, charWidthRatio: ratio };
    }

    console.log(`📏 Measured ${fontFamily} (body): ${ratio.toFixed(3)}`);
  }

  enrichedTheme.typography = typography;
  return enrichedTheme;
}

/**
 * Create a font metrics cache in localStorage for faster lookups.
 * This avoids re-measuring fonts that have already been measured.
 */
const FONT_METRICS_CACHE_KEY = 'nextslide_font_metrics_cache';
const CACHE_VERSION = 1;

interface FontMetricsCache {
  version: number;
  metrics: Record<string, number>;
  timestamp: number;
}

/**
 * Get cached font metrics from localStorage.
 */
export function getCachedFontMetrics(): Record<string, number> {
  try {
    const cached = localStorage.getItem(FONT_METRICS_CACHE_KEY);
    if (!cached) return {};

    const data: FontMetricsCache = JSON.parse(cached);

    // Check cache version
    if (data.version !== CACHE_VERSION) {
      return {};
    }

    // Check if cache is older than 7 days
    const age = Date.now() - data.timestamp;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (age > maxAge) {
      return {};
    }

    return data.metrics || {};
  } catch (error) {
    console.error('Failed to read font metrics cache:', error);
    return {};
  }
}

/**
 * Save font metrics to localStorage cache.
 */
export function saveFontMetricsToCache(metrics: Record<string, number>): void {
  try {
    const existingMetrics = getCachedFontMetrics();
    const mergedMetrics = { ...existingMetrics, ...metrics };

    const data: FontMetricsCache = {
      version: CACHE_VERSION,
      metrics: mergedMetrics,
      timestamp: Date.now(),
    };

    localStorage.setItem(FONT_METRICS_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save font metrics cache:', error);
  }
}

/**
 * Measure a font with caching support.
 * Checks cache first, measures if not found, then caches result.
 */
export async function measureFontWithCache(
  fontFamily: string,
  fontSize: number = 24
): Promise<number> {
  // Check cache first
  const cached = getCachedFontMetrics();
  if (cached[fontFamily]) {
    console.log(`📦 Using cached ratio for ${fontFamily}: ${cached[fontFamily].toFixed(3)}`);
    return cached[fontFamily];
  }

  // Measure the font
  const ratio = await measureFontWhenReady(fontFamily, fontSize);

  // Save to cache
  saveFontMetricsToCache({ [fontFamily]: ratio });

  return ratio;
}
