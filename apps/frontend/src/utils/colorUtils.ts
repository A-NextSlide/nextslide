/**
 * Utility functions for color manipulation and generation
 */

/**
 * Converts a hex color code to an RGB object
 * @param hex Hex color code (e.g. "#ff0000")
 * @returns RGB object with r,g,b values from 0-255
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse the hex values
  const bigint = parseInt(hex, 16);
  
  // Handle different hex formats
  if (hex.length === 3) {
    // Handle shorthand format (#RGB)
    const r = ((bigint >> 8) & 0xF) * 17;
    const g = ((bigint >> 4) & 0xF) * 17;
    const b = (bigint & 0xF) * 17;
    return { r, g, b };
  } else if (hex.length === 6) {
    // Handle full format (#RRGGBB)
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }
  
  return null;
};

/**
 * Converts RGB values to a hex color code
 * @param r Red value (0-255)
 * @param g Green value (0-255)
 * @param b Blue value (0-255)
 * @returns Hex color code (e.g. "#ff0000")
 */
export const rgbToHex = (r: number, g: number, b: number): string => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

/**
 * Parses any CSS color string (hex, rgb, rgba, hsl) to an RGB object
 * @param color CSS color string
 * @returns RGB object with r,g,b values from 0-255 and optional alpha
 */
export const parseColor = (color: string): { r: number; g: number; b: number; a?: number } | null => {
  // Create a temporary element to use the browser's color parsing
  const tempEl = document.createElement('div');
  tempEl.style.color = color;
  document.body.appendChild(tempEl);
  
  // Get the computed color
  const computedColor = getComputedStyle(tempEl).color;
  document.body.removeChild(tempEl);
  
  // Parse the computed color
  const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)/);
  
  if (!match) return null;
  
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const a = match[4] ? parseFloat(match[4]) : undefined;
  
  return { r, g, b, a };
};

/**
 * Adjusts the brightness of a color
 * @param color Hex color code
 * @param amount Amount to adjust brightness (-1 to 1)
 * @returns Adjusted hex color
 */
export const adjustBrightness = (color: string, amount: number): string => {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  
  const { r, g, b } = rgb;
  
  // Adjust brightness
  const newR = Math.max(0, Math.min(255, r + Math.round(255 * amount)));
  const newG = Math.max(0, Math.min(255, g + Math.round(255 * amount)));
  const newB = Math.max(0, Math.min(255, b + Math.round(255 * amount)));
  
  return rgbToHex(newR, newG, newB);
};

/**
 * Converts RGB to HSL
 * @param r Red value (0-255)
 * @param g Green value (0-255)
 * @param b Blue value (0-255)
 * @returns HSL object with h (0-360), s (0-100), l (0-100)
 */
export const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

/**
 * Converts HSL to RGB
 * @param h Hue (0-360)
 * @param s Saturation (0-100)
 * @param l Lightness (0-100)
 * @returns RGB object with r, g, b values (0-255)
 */
export const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

/**
 * Generates a theme-aware color palette for charts with variations of accent color darkness
 * @param accentColor Base accent color in hex
 * @param backgroundColor Background color to consider for contrast
 * @param count Number of colors to generate
 * @param textColor Optional text color to incorporate for variety
 * @returns Array of hex color codes
 */
export const generateChartColorPalette = (
  accentColor: string,
  backgroundColor: string,
  count: number,
  textColor?: string
): string[] => {
  const palette: string[] = [];
  
  // Determine if background is light or dark
  const isDarkBg = !isLightColor(backgroundColor);
  
  // Get HSL values of the accent color
  const rgb = hexToRgb(accentColor);
  if (!rgb) return Array(count).fill(accentColor);
  
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  // Get background lightness to ensure we don't match it
  const bgRgb = hexToRgb(backgroundColor);
  const bgHsl = bgRgb ? rgbToHsl(bgRgb.r, bgRgb.g, bgRgb.b) : { h: 0, s: 0, l: isDarkBg ? 10 : 90 };
  
  // Generate variations of the accent color only (same hue, different lightness)
  if (count === 1) {
    return [accentColor];
  }
  
  // Define lightness range based on background
  // For dark backgrounds: use lighter shades (50-85%)
  // For light backgrounds: use darker shades (25-60%)
  const minLight = isDarkBg ? 50 : 25;
  const maxLight = isDarkBg ? 85 : 60;
  
  // Avoid background lightness range
  const bgLightness = bgHsl.l;
  const safeMargin = 15; // Minimum difference from background
  
  for (let i = 0; i < count; i++) {
    // Create even distribution across the lightness range
    const step = (maxLight - minLight) / (count - 1);
    let targetLightness = count === 1 ? hsl.l : minLight + (i * step);
    
    // Ensure we don't get too close to background lightness
    if (Math.abs(targetLightness - bgLightness) < safeMargin) {
      if (isDarkBg) {
        // For dark backgrounds, push lighter
        targetLightness = Math.min(bgLightness + safeMargin, maxLight);
      } else {
        // For light backgrounds, push darker
        targetLightness = Math.max(bgLightness - safeMargin, minLight);
      }
    }
    
    // Keep the same hue as accent, full saturation, vary only lightness
    const saturation = Math.max(60, Math.min(90, hsl.s)); // Keep saturation vibrant
    const newRgb = hslToRgb(hsl.h, saturation, targetLightness);
    const color = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    
    // Double-check we're not matching background
    if (color !== backgroundColor) {
      palette.push(color);
    }
  }
  
  // If we have textColor and room for more variation, add one shade based on text color
  if (textColor && count >= 3 && palette.length >= 2) {
    const textRgb = hexToRgb(textColor);
    if (textRgb) {
      const textHsl = rgbToHsl(textRgb.r, textRgb.g, textRgb.b);
      // Blend accent hue with text color for one variation
      const blendedHue = hsl.h; // Keep accent hue dominant
      const blendedSat = Math.min(hsl.s, 70); // Slightly muted
      const blendedLight = isDarkBg ? 65 : 45; // Mid-range
      const blendedRgb = hslToRgb(blendedHue, blendedSat, blendedLight);
      const blendedColor = rgbToHex(blendedRgb.r, blendedRgb.g, blendedRgb.b);
      
      // Replace the middle color with this blended one for subtle variety
      if (palette.length >= 3) {
        const midIndex = Math.floor(palette.length / 2);
        palette[midIndex] = blendedColor;
      }
    }
  }
  
  return palette;
};

/**
 * Generates a complementary color
 * @param color Hex color code
 * @returns Complementary color in hex
 */
export const getComplementaryColor = (color: string): string => {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  
  // Get complementary color by inverting RGB values
  const r = 255 - rgb.r;
  const g = 255 - rgb.g;
  const b = 255 - rgb.b;
  
  return rgbToHex(r, g, b);
};

/**
 * Generates an array of colors from a base color with varying brightness
 * @param baseColor Hex color code to use as the base
 * @param count Number of colors to generate
 * @returns Array of hex color codes
 */
export const generateColorPalette = (baseColor: string, count: number): string[] => {
  const palette: string[] = [];
  const rgb = hexToRgb(baseColor);
  
  if (!rgb) return Array(count).fill(baseColor);
  
  // Calculate brightness steps
  const step = 1.6 / (count - 1);
  
  // Generate palette
  for (let i = 0; i < count; i++) {
    const brightness = -0.8 + (step * i);
    palette.push(adjustBrightness(baseColor, brightness));
  }
  
  return palette;
};

/**
 * Generates a random hex color code
 * @returns Random hex color
 */
export const getRandomColor = (): string => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

/**
 * Generates an array of distinct colors suitable for data visualization
 * @param count Number of colors to generate
 * @returns Array of hex color codes
 */
export const generateDataColors = (count: number): string[] => {
  // For small sets, use a predefined palette
  const basePalette = [
    '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#0099C6', '#DD4477',
    '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11', '#6633CC',
    '#E67300', '#8B0707', '#329262', '#5574A6', '#3B3EAC'
  ];
  
  if (count <= basePalette.length) {
    return basePalette.slice(0, count);
  }
  
  // For larger sets, generate colors with good spacing
  const colors: string[] = [...basePalette];
  
  // Add more colors using HSL to ensure good distribution
  for (let i = basePalette.length; i < count; i++) {
    const hue = (i * 137.5) % 360; // Use golden angle approximation for better distribution
    const saturation = 65 + Math.random() * 20; // 65-85%
    const lightness = 45 + Math.random() * 10; // 45-55%
    
    // Convert HSL to hex
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;
    
    // HSL to RGB conversion
    let r: number, g: number, b: number;
    
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    // Convert RGB to hex
    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    colors.push(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
  }
  
  return colors;
};

/**
 * Determines if a color is light or dark
 * @param color Hex color code
 * @returns Boolean indicating if the color is light
 */
export const isLightColor = (color: string): boolean => {
  const rgb = hexToRgb(color);
  if (!rgb) return true;
  
  // Calculate perceived brightness using the YIQ formula
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  
  return brightness >= 128;
};

/**
 * Determines the best text color (black or white) for a given background color
 * @param bgColor Background color in hex
 * @returns '#ffffff' or '#000000' depending on which has better contrast
 */
export const getContrastTextColor = (bgColor: string): string => {
  return isLightColor(bgColor) ? '#000000' : '#ffffff';
};

/**
 * Applies an alpha value to a hex color
 * @param color Hex color code
 * @param alpha Alpha value (0-1)
 * @returns RGBA color string
 */
export const applyAlpha = (color: string, alpha: number): string => {
  const rgb = hexToRgb(color);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

/**
 * Calculates the color distance between two colors
 * @param color1 First hex color
 * @param color2 Second hex color
 * @returns Distance value (0-441, higher = more different)
 */
export const getColorDistance = (color1: string, color2: string): number => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 0;

  // Euclidean distance in RGB space
  const rDiff = rgb1.r - rgb2.r;
  const gDiff = rgb1.g - rgb2.g;
  const bDiff = rgb1.b - rgb2.b;

  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
};

/**
 * Checks if two colors are similar (too close to distinguish)
 * @param color1 First hex color
 * @param color2 Second hex color
 * @param threshold Distance threshold (default 50, lower = more strict)
 * @returns True if colors are too similar
 */
export const areColorsSimilar = (color1: string, color2: string, threshold: number = 50): boolean => {
  return getColorDistance(color1, color2) < threshold;
};

/**
 * Filters chart colors to ensure they don't match the background
 * @param colors Array of chart colors
 * @param backgroundColor Background color to avoid
 * @param minDistance Minimum color distance required (default 80)
 * @returns Filtered array of colors that contrast with background
 */
export const ensureChartColorsContrastWithBackground = (
  colors: string[],
  backgroundColor?: string,
  minDistance: number = 80
): string[] => {
  if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === 'none') {
    return colors;
  }

  // Normalize background color to hex
  let bgHex = backgroundColor;
  if (backgroundColor.startsWith('rgba') || backgroundColor.startsWith('rgb')) {
    const match = backgroundColor.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0]);
      const g = parseInt(match[1]);
      const b = parseInt(match[2]);
      bgHex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1, 7);
    }
  }

  // Remove alpha channel if present
  if (bgHex.length === 9 && bgHex.startsWith('#')) {
    bgHex = bgHex.substring(0, 7);
  }

  // Filter out colors that are too similar to background
  const filteredColors = colors.filter(color => {
    let colorHex = color;

    // Convert to hex if needed
    if (color.startsWith('rgba') || color.startsWith('rgb')) {
      const match = color.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]);
        const g = parseInt(match[1]);
        const b = parseInt(match[2]);
        colorHex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1, 7);
      }
    }

    // Remove alpha channel
    if (colorHex.length === 9 && colorHex.startsWith('#')) {
      colorHex = colorHex.substring(0, 7);
    }

    const distance = getColorDistance(colorHex, bgHex);
    return distance >= minDistance;
  });

  // If all colors were filtered out, return adjusted versions
  if (filteredColors.length === 0) {
    const isDarkBg = !isLightColor(bgHex);
    return colors.map((_, index) => {
      // Use theme-appropriate fallback colors
      const fallbackColors = isDarkBg
        ? ['#61cdbb', '#97e3d5', '#e8c1a0', '#f47560', '#f1e15b', '#e8a838']
        : ['#0D47A1', '#B71C1C', '#006064', '#1B5E20', '#4A148C', '#880E4F'];
      return fallbackColors[index % fallbackColors.length];
    });
  }

  return filteredColors;
};

/**
 * Gets theme-appropriate colors based on background brightness
 * @param backgroundColor Background color
 * @param count Number of colors needed
 * @returns Array of theme-appropriate colors
 */
export const getThemeAppropriateChartColors = (
  backgroundColor?: string,
  count: number = 10
): string[] => {
  if (!backgroundColor || backgroundColor === 'transparent' || backgroundColor === 'none') {
    // Default to light theme colors
    return [
      '#61cdbb', '#97e3d5', '#e8c1a0', '#f47560', '#f1e15b',
      '#e8a838', '#a7cee3', '#b2df8a', '#fb9a99', '#fdbf6f'
    ].slice(0, count);
  }

  // Normalize to hex
  let bgHex = backgroundColor;
  if (backgroundColor.startsWith('rgba') || backgroundColor.startsWith('rgb')) {
    const match = backgroundColor.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0]);
      const g = parseInt(match[1]);
      const b = parseInt(match[2]);
      bgHex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1, 7);
    }
  }

  if (bgHex.length === 9 && bgHex.startsWith('#')) {
    bgHex = bgHex.substring(0, 7);
  }

  const isDarkBg = !isLightColor(bgHex);

  // Return appropriate palette based on background
  if (isDarkBg) {
    // Light/vibrant colors for dark backgrounds
    return [
      '#61cdbb', '#97e3d5', '#e8c1a0', '#f47560', '#f1e15b',
      '#e8a838', '#a7cee3', '#b2df8a', '#fb9a99', '#fdbf6f',
      '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF'
    ].slice(0, count);
  } else {
    // Dark/saturated colors for light backgrounds
    return [
      '#0D47A1', '#B71C1C', '#006064', '#1B5E20', '#4A148C',
      '#880E4F', '#E65100', '#01579B', '#BF360C', '#004D40',
      '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099'
    ].slice(0, count);
  }
};