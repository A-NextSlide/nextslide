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