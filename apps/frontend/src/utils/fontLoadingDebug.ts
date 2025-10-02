import { FontLoadingService } from '../services/FontLoadingService';
import { FONT_CATEGORIES } from '../registry/library/fonts';

/**
 * Debug utility for testing font loading
 */
export const FontLoadingDebug = {
  /**
   * Test loading a specific font and log the results
   */
  testFont: async (fontName: string): Promise<void> => {
    console.log(`🔍 Testing font: ${fontName}`);
    const startTime = performance.now();
    
    try {
      await FontLoadingService.loadFont(fontName);
      const loadTime = performance.now() - startTime;
      console.log(`✅ ${fontName} loaded in ${loadTime.toFixed(2)}ms`);
      
      // Check if font is actually loaded
      if (FontLoadingService.isFontLoaded(fontName)) {
        console.log(`✅ ${fontName} is marked as loaded in the service`);
      }
      
      // Test if font is actually available
      if ('fonts' in document) {
        const isAvailable = document.fonts.check(`16px "${fontName}"`);
        console.log(`📊 ${fontName} available in document.fonts: ${isAvailable}`);
      }
    } catch (error) {
      console.error(`❌ Failed to load ${fontName}:`, error);
    }
  },
  
  /**
   * Test loading all fonts in a category
   */
  testCategory: async (categoryName: string): Promise<void> => {
    const fonts = FONT_CATEGORIES[categoryName];
    if (!fonts) {
      console.error(`❌ Category "${categoryName}" not found`);
      return;
    }
    
    console.log(`\n📁 Testing ${categoryName} category (${fonts.length} fonts):`);
    console.log('═'.repeat(50));
    
    let loaded = 0;
    let failed = 0;
    
    for (const fontDef of fonts) {
      try {
        await FontLoadingService.loadFont(fontDef.name);
        loaded++;
        console.log(`✅ ${fontDef.name}`);
      } catch (error) {
        failed++;
        console.error(`❌ ${fontDef.name}:`, error);
      }
    }
    
    console.log('═'.repeat(50));
    console.log(`Summary: ${loaded} loaded, ${failed} failed`);
  },
  
  /**
   * Test all categories
   */
  testAll: async (): Promise<void> => {
    console.log('🔍 Testing all font categories...\n');
    
    for (const categoryName of Object.keys(FONT_CATEGORIES)) {
      await FontLoadingDebug.testCategory(categoryName);
      console.log('\n');
    }
  },
  
  /**
   * Test the problematic fonts mentioned by the user
   */
  testProblematicFonts: async (): Promise<void> => {
    const problematicFonts = ['Comfortaa', 'Quicksand', 'Josefin Sans', 'Cabin', 'Barlow', 'Varela Round'];
    
    console.log('🔍 Testing problematic fonts...');
    console.log('═'.repeat(50));
    
    for (const fontName of problematicFonts) {
      await FontLoadingDebug.testFont(fontName);
      console.log('');
    }
    
    console.log('═'.repeat(50));
  },
  
  /**
   * Get loading statistics
   */
  getStats: (): void => {
    const stats = FontLoadingService.getLoadingStats();
    console.table(stats);
  },
  
  /**
   * Test Google Fonts URL generation
   */
  testGoogleFontUrl: (fontName: string): string | null => {
    const fontDef = Object.values(FONT_CATEGORIES).flat().find(f => f.name === fontName);
    if (!fontDef) {
      console.error(`Font "${fontName}" not found`);
      return null;
    }
    
    if (fontDef.source !== 'google') {
      console.log(`Font "${fontName}" is not a Google font (source: ${fontDef.source})`);
      return null;
    }
    
    const weights = String(fontDef.weight || '400').split(' ').map(w => w.trim()).filter(Boolean);
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontDef.family)}:ital,wght@${weights.map(w => `0,${w}`).join(';')}&display=swap`;
    
    console.log(`Google Fonts URL for ${fontName}:`);
    console.log(url);
    return url;
  },
  
  /**
   * Test Fontshare fonts specifically
   */
  testFontshare: async (): Promise<void> => {
    const fontshareCategory = FONT_CATEGORIES['Modern & Fontshare'];
    if (!fontshareCategory) {
      console.error('Fontshare category not found');
      return;
    }
    
    console.log('🔍 Testing Fontshare fonts...');
    console.log('═'.repeat(50));
    
    for (const fontDef of fontshareCategory) {
      console.log(`\n📦 Testing ${fontDef.name} (family: "${fontDef.family}")`);
      
      // Check if font stylesheet link exists
      const linkId = `fontshare-${fontDef.family.replace(/\s+/g, '-').toLowerCase()}`;
      const link = document.querySelector(`link#${linkId}`);
      
      if (link) {
        console.log(`✅ Stylesheet link found: ${link.getAttribute('href')}`);
      } else {
        console.log(`❌ No stylesheet link found with ID: ${linkId}`);
      }
      
      // Try loading the font
      try {
        await FontLoadingService.loadFont(fontDef.name);
        console.log(`✅ Font loaded successfully`);
        
        // Check if font is actually available
        if ('fonts' in document) {
          const fontLoadString = `16px "${fontDef.family}"`;
          const isAvailable = document.fonts.check(fontLoadString);
          console.log(`📊 Font available (${fontLoadString}): ${isAvailable}`);
          
          // Also check with the display name
          const displayNameCheck = document.fonts.check(`16px "${fontDef.name}"`);
          console.log(`📊 Font available with display name: ${displayNameCheck}`);
        }
      } catch (error) {
        console.error(`❌ Failed to load:`, error);
      }
    }
    
    console.log('\n' + '═'.repeat(50));
  }
};

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).FontLoadingDebug = FontLoadingDebug;
} 