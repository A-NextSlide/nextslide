import { FONT_CATEGORIES, FontDefinition } from '@/registry/library/fonts';

/**
 * Font capabilities utility functions
 * Determines what styles (bold, italic) are supported by different fonts
 */

/**
 * Find font definition by name
 */
export function findFontDefinition(fontName: string): FontDefinition | null {
  for (const category in FONT_CATEGORIES) {
    const fontDef = FONT_CATEGORIES[category].find(f => f.name === fontName);
    if (fontDef) {
      return fontDef;
    }
  }
  return null;
}

/**
 * Check if a font supports bold weight
 */
export function fontSupportsBold(fontName: string): boolean {
  // Special cases for fonts that are bold-only or don't support additional bold
  // Check this FIRST before other logic
  const boldOnlyFonts = [
    'Impact', // Impact is already bold by design - no additional bold weight
    'Archivo Black', // Already black weight
    'Anton', // Already bold by design
    'Bebas Neue', // Display font, typically single weight
    'Alfa Slab One', // Already bold slab serif
    'Russo One', // Already bold
    'Bungee', // Display font, single weight
    'Monoton', // Display font, single weight
    'Shrikhand', // Display font, single weight
    'Ultra', // Already ultra bold
    'Creepster', // Display font, single weight
    'Bowlby One', // Already bold
    'Righteous', // Display font, single weight
    'Fredoka One', // Already bold
    'Permanent Marker', // Marker style, single weight
    'Pacifico', // Script font, single weight
    'Lobster', // Script font, single weight
    'Satisfy', // Script font, single weight
    'Abril Fatface', // Already fat face
    'Calistoga', // Single weight display font
    'Varela Round', // Single weight rounded font
    'Gambarino', // Single weight
    'PT Mono', // Monospace with single weight
    'Young Serif', // Single weight serif
    'Instrument Serif', // Single weight serif
    'DM Serif Text', // Single weight serif
    'DM Serif Display', // Single weight serif
    'Fugaz One', // Already bold display font
    'Squada One', // Single weight display font
    'Titan One', // Already bold display font
    'Yeseva One', // Single weight display font
    'Fjalla One' // Single weight display font
  ];

  if (boldOnlyFonts.includes(fontName)) {
    return false; // These fonts don't support additional bold because they're already bold
  }

  // System fonts that don't support bold (very rare)
  const systemFontsNoBold = [
    // Most system fonts DO support bold, so this list should be very short
    // Add specific system fonts here only if they truly don't support bold
  ];

  if (systemFontsNoBold.includes(fontName)) {
    return false;
  }

  const fontDef = findFontDefinition(fontName);
  if (!fontDef) {
    // If font not found in our definitions, assume it supports bold (system fonts usually do)
    return true;
  }

  // Check if the font has bold weights defined
  if (fontDef.weight) {
    const weights = String(fontDef.weight);
    // Look for bold weights (700, 800, 900) or the word "bold"
    const hasBoldWeights = weights.includes('700') || weights.includes('800') || weights.includes('900') || weights.includes('bold');
    
    // If weights are explicitly defined but don't include bold weights, return false
    if (!hasBoldWeights) {
      return false;
    }
    
    return true;
  }

  // System fonts typically support bold (after checking special cases above)
  if (fontDef.source === 'system') {
    return true;
  }

  // If no weight is defined, assume it supports bold (for undefined cases)
  return true;
}

/**
 * Check if a font supports italic style
 */
export function fontSupportsItalic(fontName: string): boolean {
  // Fonts that typically don't support italic (display, decorative, monospace often don't)
  // Check this FIRST before other logic
  const noItalicFonts = [
    // Google Fonts that don't support italic
    'Bebas Neue',
    'Pacifico', // Script font - doesn't support italic
    'Abril Fatface',
    'Archivo Black', 
    'Fredoka One',
    'Permanent Marker',
    'Lobster', // Script font - doesn't support italic
    'Anton',
    'Satisfy', // Script font - doesn't support italic
    'Varela Round',
    'Calistoga',
    'Comfortaa', // Rounded sans-serif - doesn't support italic
    'Quicksand', // Rounded sans-serif - doesn't support italic
    'Righteous',
    'Alfa Slab One',
    'Russo One',
    'Bungee',
    'Monoton',
    'Shrikhand',
    'Ultra',
    'Creepster',
    'Bowlby One',
    
    // Monospace fonts (most don't support italic)
    'Roboto Mono',
    'Source Code Pro',
    'Fira Code',
    'JetBrains Mono',
    'Space Mono',
    'PT Mono',
    'IBM Plex Mono',
    'Ubuntu Mono',
    'Inconsolata',
    'Courier Prime',
    'Red Hat Mono',
    'Overpass Mono',
    'Azeret Mono',
    'Martian Mono',
    'Commit Mono',
    
    // Fontshare fonts that don't support italic
    'Gambarino',
    'Boska',
    'Stardom',
    
    // Contemporary fonts that don't support italic
    'Young Serif',
    'Instrument Serif',
    'DM Serif Text',
    'DM Serif Display',
    
    // Unique fonts that don't support italic
    'Orbitron',
    'Audiowide',
    'Electrolize',
    'Michroma',
    'Aldrich',
    'Quantico',
    
    // System fonts that don't support italic
    'Impact' // Impact doesn't support italic on most systems
  ];

  if (noItalicFonts.includes(fontName)) {
    return false;
  }

  const fontDef = findFontDefinition(fontName);
  if (!fontDef) {
    // If font not found in our definitions, assume it supports italic (system fonts usually do)
    return true;
  }

  // System fonts typically support italic (after checking special cases above)
  if (fontDef.source === 'system') {
    return true;
  }

  // If no specific restrictions, assume it supports italic
  return true;
}

/**
 * Get font capabilities for a given font
 */
export interface FontCapabilities {
  supportsBold: boolean;
  supportsItalic: boolean;
  supportsUnderline: boolean; // All fonts support underline (it's a text decoration)
  supportsStrikethrough: boolean; // All fonts support strikethrough (it's a text decoration)
}

export function getFontCapabilities(fontName: string): FontCapabilities {
  return {
    supportsBold: fontSupportsBold(fontName),
    supportsItalic: fontSupportsItalic(fontName),
    supportsUnderline: true, // All fonts support underline
    supportsStrikethrough: true, // All fonts support strikethrough
  };
}

/**
 * Check if a specific formatting is supported by a font
 */
export function fontSupportsFormatting(fontName: string, formatting: 'bold' | 'italic' | 'underline' | 'strike'): boolean {
  const capabilities = getFontCapabilities(fontName);
  

  
  switch (formatting) {
    case 'bold':
      return capabilities.supportsBold;
    case 'italic':
      return capabilities.supportsItalic;
    case 'underline':
      return capabilities.supportsUnderline;
    case 'strike':
      return capabilities.supportsStrikethrough;
    default:
      return true;
  }
}

/**
 * Check if a font's default weight is bold (>= 600)
 */
export function fontDefaultIsBold(fontName: string): boolean {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef) {
    return false; // Unknown fonts default to normal weight
  }

  // Fonts that are inherently bold by design
  const inherentlyBoldFonts = [
    'Impact', 'Archivo Black', 'Anton', 'Bebas Neue', 'Alfa Slab One',
    'Russo One', 'Ultra', 'Bowlby One', 'Fredoka One', 'Abril Fatface',
    'Fugaz One', 'Titan One', 'Yeseva One', 'Black Ops One', 'Bangers'
  ];

  if (inherentlyBoldFonts.includes(fontName)) {
    return true;
  }

  // Check the first weight in the definition
  if (fontDef.weight) {
    const weights = String(fontDef.weight).trim().split(/\s+/);
    const firstWeight = parseInt(weights[0]) || 400;
    return firstWeight >= 600;
  }

  return false;
}

/**
 * Get the default font weight for a font
 */
export function getFontDefaultWeight(fontName: string): string {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef) {
    return '400'; // Default to normal weight
  }

  // Check if font has explicit weights
  if (fontDef.weight) {
    const weights = String(fontDef.weight).trim().split(/\s+/);
    return weights[0] || '400';
  }

  return '400';
}

/**
 * Get available font weights for a specific font
 */
export function getAvailableFontWeights(fontName: string): string[] {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef) {
    // For unknown fonts (system fonts not in our definitions), return common weights
    return ['normal', 'bold', '400', '700'];
  }

  // System fonts typically support normal and bold
  if (fontDef.source === 'system') {
    return ['normal', 'bold', '400', '700'];
  }

  // For Google fonts, parse the weight property
  if (fontDef.weight) {
    const weightString = String(fontDef.weight).trim();
    const weights = weightString.split(/\s+/).map(w => w.trim()).filter(Boolean);
    
    // Convert to our format and add aliases
    const availableWeights: string[] = [];
    
    weights.forEach(weight => {
      availableWeights.push(weight);
      
      // Add aliases for common weights
      if (weight === '400') {
        availableWeights.push('normal');
      } else if (weight === '700') {
        availableWeights.push('bold');
      }
    });
    
    // Remove duplicates and sort
    const uniqueWeights = Array.from(new Set(availableWeights));
    
    // Sort weights in logical order
    return uniqueWeights.sort((a, b) => {
      const getWeightValue = (w: string) => {
        if (w === 'normal') return 400;
        if (w === 'bold') return 700;
        return parseInt(w) || 400;
      };
      return getWeightValue(a) - getWeightValue(b);
    });
  }

  // Fallback: if no weight specified, assume it supports normal
  return ['normal', '400'];
} 