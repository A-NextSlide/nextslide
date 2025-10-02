import { FONT_CATEGORIES, FontDefinition } from '../registry/library/fonts';

/**
 * Find font definition by name
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findFontDefinition(fontName: string): FontDefinition | null {
  const target = normalizeName(fontName);
  for (const category in FONT_CATEGORIES) {
    // Exact or case-insensitive match on display name
    let fontDef = FONT_CATEGORIES[category].find(f => f.name === fontName || normalizeName(f.name) === target);
    if (fontDef) return fontDef;
    // Fallback: match by CSS family too
    fontDef = FONT_CATEGORIES[category].find(f => normalizeName(f.family) === target);
    if (fontDef) return fontDef;
  }
  return null;
}

/**
 * Get the CSS font-family value for a given font name
 * This handles the mapping between display names and actual CSS font-family values
 */
export function getFontFamilyCSS(fontName: string): string {
  // Find the font definition
  for (const category in FONT_CATEGORIES) {
    const fontDef = FONT_CATEGORIES[category].find(f => f.name === fontName);
    if (fontDef) {
      return fontDef.family;
    }
  }
  
  // If not found in definitions, return the font name as-is
  return fontName;
}

/**
 * Get a properly formatted font-family CSS string with fallbacks
 */
export function getFontFamilyWithFallback(fontName: string): string {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef) {
    // If font not found in our definitions, return the name as-is with fallback
    return `"${fontName}", sans-serif`;
  }

  // Use the family property from the definition (which has the correct CSS name)
  const cssFamily = fontDef.family;
  
  // Add appropriate fallbacks based on font source and type
  let fallback = 'sans-serif'; // Default fallback
  
  // Determine fallback based on font characteristics
  if (fontDef.source === 'system') {
    // System fonts don't need quotes and have their own fallbacks
    return cssFamily;
  }
  
  // Check font category to determine appropriate fallback
  for (const [category, fonts] of Object.entries(FONT_CATEGORIES)) {
    if (fonts.some(f => f.name === fontName)) {
      switch (category) {
        case 'Serif':
        case 'Elegant':
          fallback = 'serif';
          break;
        case 'Monospace':
          fallback = 'monospace';
          break;
        case 'Script':
          fallback = 'cursive';
          break;
        case 'Pixel & Retro Display':
          fallback = 'monospace';
          break;
        default:
          fallback = 'sans-serif';
      }
      break;
    }
  }
  
  // Return with quotes and fallback
  return `"${cssFamily}", ${fallback}`;
}

/**
 * Get font weight mapping for a font
 */
export function getFontWeightOptions(fontName: string): { value: string; label: string }[] {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef || !fontDef.weight) {
    return [
      { value: '400', label: 'Normal' },
      { value: '700', label: 'Bold' }
    ];
  }

  const weights = String(fontDef.weight).split(' ').map(w => w.trim()).filter(Boolean);
  
  const weightLabels: Record<string, string> = {
    '100': 'Thin',
    '200': 'Extra Light',
    '300': 'Light',
    '400': 'Normal',
    '500': 'Medium',
    '600': 'Semi Bold',
    '700': 'Bold',
    '800': 'Extra Bold',
    '900': 'Black'
  };

  return weights.map(weight => ({
    value: weight,
    label: weightLabels[weight] || weight
  }));
}

/**
 * Check if a font is a variable font
 */
export function isVariableFont(fontName: string): boolean {
  const fontDef = findFontDefinition(fontName);
  return fontDef?.style === 'variable' || fontName.includes('Variable');
}

/**
 * Get the Fontshare API URL for a specific font
 */
export function getFontshareUrl(fontName: string): string | null {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef || fontDef.source !== 'fontshare') {
    return null;
  }

  let url = `https://api.fontshare.com/v2/css?f[]=${encodeURIComponent(fontDef.family)}`;
  
  if (fontDef.weight) {
    const weights = String(fontDef.weight).split(' ').map(w => w.trim()).filter(Boolean);
    if (weights.length > 0) {
      url += `@${weights.join(',')}`;
    }
  }
  
  url += '&display=swap';
  return url;
}

/**
 * Test if a font is properly loaded in the browser
 */
export function testFontLoading(fontName: string): boolean {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef) {
    return false;
  }

  if ('fonts' in document) {
    // Test with the CSS family name
    const testString = `16px "${fontDef.family}"`;
    return document.fonts.check(testString);
  }

  return false;
}

/**
 * Get debug information for a font
 */
export function getFontDebugInfo(fontName: string): {
  found: boolean;
  definition?: FontDefinition;
  cssFamily?: string;
  isLoaded?: boolean;
  fontshareUrl?: string | null;
} {
  const fontDef = findFontDefinition(fontName);
  
  if (!fontDef) {
    return { found: false };
  }

  return {
    found: true,
    definition: fontDef,
    cssFamily: fontDef.family,
    isLoaded: testFontLoading(fontName),
    fontshareUrl: fontDef.source === 'fontshare' ? getFontshareUrl(fontName) : null
  };
} 

/**
 * Extract all unique font families used in a deck
 */
export function extractDeckFonts(deckData: any): string[] {
  const fonts = new Set<string>();
  
  if (!deckData || !deckData.slides) return [];
  
  // Extract fonts from all slides
  deckData.slides.forEach((slide: any) => {
    if (slide.components) {
      slide.components.forEach((component: any) => {
        // Check for fontFamily in component props
        if (component.props?.fontFamily) {
          fonts.add(component.props.fontFamily);
        }
        
        // Check for fonts in text components with nested structure
        if (component.type === 'TiptapTextBlock' || component.type === 'TextBlock') {
          if (component.props?.texts) {
            extractFontsFromTexts(component.props.texts, fonts);
          }
        }
        
        // Check for fonts in shapes with text
        if (component.type === 'ShapeWithText' && component.props?.hasText) {
          if (component.props?.texts) {
            extractFontsFromTexts(component.props.texts, fonts);
          }
        }
      });
    }
  });
  
  return Array.from(fonts);
}

/**
 * Helper to extract fonts from text content structures
 */
function extractFontsFromTexts(texts: any, fonts: Set<string>): void {
  if (!texts) return;
  
  // Handle different text formats
  if (Array.isArray(texts)) {
    texts.forEach(text => {
      if (text.style?.fontFamily) {
        fonts.add(text.style.fontFamily);
      }
    });
  } else if (texts.content && Array.isArray(texts.content)) {
    // Handle Tiptap format
    texts.content.forEach((node: any) => {
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach((textNode: any) => {
          if (textNode.style?.fontFamily) {
            fonts.add(textNode.style.fontFamily);
          }
        });
      }
    });
  }
} 