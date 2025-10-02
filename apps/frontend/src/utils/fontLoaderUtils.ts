// Font loader utility for dynamic font stylesheet loading

/**
 * Map of font category names to stylesheet URLs
 * These will be loaded on-demand to avoid loading all fonts at once
 */
// Updated stylesheet map for better font coverage
const FONT_STYLESHEET_MAP: Record<string, string> = {
  // Enhanced sans-serif fonts
  'sans-serif': 'https://fonts.googleapis.com/css2?family=Poppins:wght@300,400,500,600,700,800,900&family=Raleway:wght@300,400,500,600,700,800,900&family=Lato:wght@300,400,700,900&family=Roboto:wght@300,400,500,700,900&family=Open+Sans:wght@300,400,500,600,700,800&family=Inter:wght@300,400,500,600,700,800,900&family=Outfit:wght@300,400,500,600,700,800,900&family=Manrope:wght@300,400,500,600,700,800&family=Plus+Jakarta+Sans:wght@300,400,500,600,700,800&family=Sora:wght@300,400,500,600,700,800&family=DM+Sans:wght@400,500,700&family=Figtree:wght@300,400,500,600,700,800,900&family=Space+Grotesk:wght@300,400,500,600,700&display=swap',
  
  // Enhanced serif fonts
  'serif': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400,500,600,700,800,900&family=Merriweather:wght@300,400,700,900&family=Lora:wght@400,500,600,700&family=PT+Serif:wght@400,700&family=Crimson+Pro:wght@300,400,500,600,700,800,900&family=Bitter:wght@300,400,500,600,700,800&family=EB+Garamond:wght@400,500,600,700,800&family=Literata:wght@300,400,500,600,700,800,900&family=Newsreader:wght@300,400,500,600,700,800&display=swap',
  
  // Enhanced display fonts
  'display': 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Righteous&family=Alfa+Slab+One&family=Russo+One&family=Passion+One:wght@400,700,900&family=Bungee&family=Monoton&family=Shrikhand&family=Ultra&family=Creepster&family=Bowlby+One&display=swap',
  
  // Complete monospace fonts collection
  'monospace': 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300,400,500,600,700&family=Source+Code+Pro:wght@300,400,500,600,700,800,900&family=Fira+Code:wght@300,400,500,600,700&family=JetBrains+Mono:wght@300,400,500,600,700,800&family=Ubuntu+Mono:wght@400,700&family=Inconsolata:wght@300,400,500,600,700,800,900&family=IBM+Plex+Mono:wght@300,400,500,600,700&family=Courier+Prime:wght@400,700&family=Red+Hat+Mono:wght@300,400,500,600,700&family=Overpass+Mono:wght@300,400,600,700&display=swap',
  
  // System replacement fonts - distinct fonts for each system font
  'system': 'https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300,400,500,600,700,800,900&family=Source+Sans+Pro:wght@300,400,600,700,900&family=Work+Sans:wght@300,400,500,600,700,800,900&family=Nunito+Sans:wght@300,400,500,600,700,800,900&display=swap',
  
  // Design fonts
  'design-primary': 'https://fonts.googleapis.com/css2?family=Outfit:wght@300,400,500,600,700,800,900&family=Josefin+Sans:wght@300,400,500,600,700&family=Karla:wght@300,400,500,600,700,800&family=Mulish:wght@300,400,500,600,700,800,900&family=Exo+2:wght@300,400,500,600,700,800,900&family=Lexend:wght@300,400,500,600,700,800,900&display=swap',
  
  // More design fonts
  'design-secondary': 'https://fonts.googleapis.com/css2?family=Quicksand:wght@300,400,500,600,700&family=Urbanist:wght@300,400,500,600,700,800,900&family=Epilogue:wght@300,400,500,600,700,800,900&family=Red+Hat+Display:wght@300,400,500,600,700,800,900&family=Commissioner:wght@300,400,500,600,700,800,900&family=Barlow+Condensed:wght@300,400,500,600,700,800,900&family=Archivo:wght@300,400,500,600,700,800,900&display=swap',
  
  // Script fonts
  'script': 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Satisfy&family=Dancing+Script:wght@400,500,600,700&family=Pacifico&family=Lobster&display=swap',
  
  // Fontshare fonts - loaded individually via API
  'fontshare': 'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&f[]=clash-display@400,500,600,700&f[]=cabinet-grotesk@400,500,700,800,900&f[]=general-sans@300,400,500,600,700&f[]=chillax@300,400,500,600,700&f[]=switzer@300,400,500,600,700,800,900&f[]=ranade@300,400,500,700&display=swap',
  
  // More Fontshare fonts
  'fontshare-secondary': 'https://api.fontshare.com/v2/css?f[]=boska@400,500,700&f[]=gambarino@400&f[]=panchang@300,400,500,600,700,800&f[]=melodrama@300,400,500,600,700&f[]=erode@300,400,500,600,700&f[]=sentient@300,400,500,700&display=swap',
  
  // Even more Fontshare fonts
  'fontshare-tertiary': 'https://api.fontshare.com/v2/css?f[]=synonym@300,400,500,600,700&f[]=supreme@300,400,500,700,800&f[]=author@300,400,500,600,700&f[]=bespoke-serif@300,400,500,600,700&f[]=stardom@400,500,700&f[]=nippo@300,400,500,700&f[]=zodiak@400,700,900&display=swap',
  
  // Additional Fontshare fonts
  'fontshare-extended': 'https://api.fontshare.com/v2/css?f[]=khand@300,400,500,600,700&f[]=telma@400,500,600,700,800&display=swap',
  
  // Unique and experimental fonts
  'unique': 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400,500,600,700,800,900&family=Exo+2:wght@100,200,300,400,500,600,700,800,900&family=Audiowide&family=Electrolize&family=Michroma&family=Saira+Condensed:wght@100,200,300,400,500,600,700,800,900&family=Saira+Extra+Condensed:wght@100,200,300,400,500,600,700,800,900&family=Teko:wght@300,400,500,600,700&family=Pathway+Gothic+One&family=Aldrich&family=Jura:wght@300,400,500,600,700&family=Quantico:wght@400,700&display=swap',
  
  // Contemporary fonts
  'contemporary': 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400,500,600,700&family=Bricolage+Grotesque:wght@200,300,400,500,600,700,800&family=Familjen+Grotesk:wght@400,500,600,700&family=Schibsted+Grotesk:wght@400,500,600,700,800,900&family=Onest:wght@100,200,300,400,500,600,700,800,900&family=Young+Serif&family=Instrument+Serif&family=Martian+Mono:wght@100,200,300,400,500,600,700,800&family=Science+Gothic:wght@100,200,300,400,500,600,700,800,900&family=Commissioner:wght@100,200,300,400,500,600,700,800,900&family=Recursive:wght@300,400,500,600,700,800,900&family=Anybody:wght@100,200,300,400,500,600,700,800,900&display=swap',
  
  // Variable fonts
  'variable': 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Roboto+Flex:wght@100..1000&family=Outfit:wght@100..900&family=Manrope:wght@200..800&family=Sora:wght@100..800&family=Fraunces:wght@100..900&display=swap'
};

// Keep track of loaded stylesheets to avoid duplicates
const loadedStylesheets = new Set<string>();

/**
 * Load a stylesheet dynamically
 * @param url The URL of the stylesheet to load
 * @returns Promise that resolves when the stylesheet is loaded
 */
export const loadStylesheet = (url: string): Promise<void> => {
  // Skip if already loaded
  if (loadedStylesheets.has(url)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    try {
      const linkElem = document.createElement('link');
      linkElem.rel = 'stylesheet';
      linkElem.href = url;
      
      // Mark loaded when complete or after timeout
      linkElem.onload = () => {
        loadedStylesheets.add(url);
        resolve();
      };
      
      linkElem.onerror = (err) => {
        // Failed to load stylesheet - resolve anyway to prevent blocking
        resolve();
      };
      
      // Add to document
      document.head.appendChild(linkElem);
      
      // Set a timeout to resolve anyway after 5 seconds
      // This prevents hanging if the stylesheet fails to load
      setTimeout(() => {
        if (!loadedStylesheets.has(url)) {
          loadedStylesheets.add(url); // Mark as "loaded" to prevent retries
          resolve();
        }
      }, 5000);
    } catch (error) {
      // Error loading stylesheet - resolve anyway to prevent blocking
      resolve();
    }
  });
};

/**
 * Load a specific font category stylesheet
 * @param category The font category to load
 * @returns Promise that resolves when the stylesheet is loaded
 */
export const loadFontCategory = async (category: string): Promise<void> => {
  // Skip external font loading if explicitly set to system fonts only mode
  if (typeof window !== 'undefined' && (window as any).__systemFontsOnlyMode) {
    return Promise.resolve();
  }
  
  // Original implementation restored
  const stylesheetUrl = FONT_STYLESHEET_MAP[category];
  if (stylesheetUrl) {
    return loadStylesheet(stylesheetUrl);
  }
  
  return Promise.resolve();
};

/**
 * Preload critical font category stylesheets
 * @param categories Array of category names to preload
 * @returns Promise that resolves when all stylesheets are loaded
 */
export const preloadFontCategories = async (categories: string[]): Promise<void> => {
  // Skip external font loading if explicitly set to system fonts only mode
  if (typeof window !== 'undefined' && (window as any).__systemFontsOnlyMode) {
    return Promise.resolve();
  }

  // Skip if we're currently dragging components to prevent lag
  if (typeof window !== 'undefined' && (window as any).__isDragging) {
    return Promise.resolve();
  }
  
  // Restored original implementation
  // Delay font loading for lower priority categories
  const highPriorityCategories = categories.filter(cat => 
    cat === 'sans-serif' || cat === 'system'
  );
  
  // Load high priority immediately
  if (highPriorityCategories.length > 0) {
    const highPriorityPromises = highPriorityCategories.map(category => loadFontCategory(category));
    await Promise.all(highPriorityPromises);
  }
  
  // Delay the rest to avoid impacting performance
  const lowPriorityCategories = categories.filter(cat => 
    cat !== 'sans-serif' && cat !== 'system'
  );
  
  if (lowPriorityCategories.length > 0) {
    // Use requestIdleCallback if available to load during idle time
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        lowPriorityCategories.forEach(category => loadFontCategory(category));
      });
    } else {
      // Otherwise delay with timeout
      setTimeout(() => {
        lowPriorityCategories.forEach(category => loadFontCategory(category));
      }, 2000);
    }
  }
  
  return Promise.resolve();
};

/**
 * Determine which font category a font belongs to
 * @param fontName The name of the font
 * @returns The category name or null if not found
 */
export const getFontCategory = (fontName: string): string | null => {
  // Check each category in the codebase's FONT_CATEGORIES
  // This is a simplified approach - in practice you'd use the actual FONT_CATEGORIES from registry
  const sansSerif = ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Source Sans Pro', 'Nunito', 'Raleway', 'Work Sans', 'Outfit', 'Manrope', 'Sora', 'Plus Jakarta Sans', 'DM Sans', 'Figtree', 'Geist', 'Space Grotesk', 'Instrument Sans', 'Bricolage Grotesque', 'Familjen Grotesk', 'Schibsted Grotesk', 'Onest', 'Noto Sans'];
  const serif = ['Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Source Serif Pro', 'Libre Baskerville', 'Crimson Text', 'Noto Serif', 'Cormorant Garamond', 'Bitter', 'Crimson Pro', 'EB Garamond', 'Literata', 'Newsreader', 'Instrument Serif', 'DM Serif Text', 'DM Serif Display', 'Roboto Serif', 'Young Serif', 'Fraunces'];
  const display = ['Bebas Neue', 'Comfortaa', 'Pacifico', 'Caveat', 'Abril Fatface', 'Archivo Black', 'Fredoka One', 'Permanent Marker', 'Lobster', 'Anton', 'Dancing Script', 'Satisfy', 'Righteous', 'Alfa Slab One', 'Russo One', 'Passion One', 'Bungee', 'Monoton', 'Shrikhand', 'Ultra', 'Creepster', 'Bowlby One', 'Fugaz One'];
  const monospace = ['Roboto Mono', 'Source Code Pro', 'JetBrains Mono', 'Fira Code', 'Space Mono', 'PT Mono', 'IBM Plex Mono', 'Ubuntu Mono', 'Inconsolata', 'Courier Prime', 'Red Hat Mono', 'Overpass Mono', 'Azeret Mono', 'Martian Mono', 'Commit Mono'];
  const fontshare = ['Cabinet Grotesk', 'Satoshi', 'General Sans', 'Clash Display', 'Chillax', 'Boska', 'Gambarino', 'Switzer', 'Ranade', 'Panchang', 'Melodrama', 'Erode', 'Sentient', 'Synonym', 'Supreme', 'Author', 'Bespoke Serif', 'Stardom', 'Nippo', 'Zodiak', 'Khand', 'Telma'];
  const design = ['Montserrat Alternates', 'Comfortaa', 'Quicksand', 'Josefin Sans', 'Cabin', 'Barlow', 'Varela Round', 'Calistoga', 'Rubik', 'Chivo', 'Karla', 'Mulish', 'Exo 2', 'Lexend', 'Urbanist', 'Epilogue', 'Red Hat Display', 'Commissioner', 'Barlow Condensed', 'Archivo', 'Nunito Sans', 'Spartan', 'Jost'];
  const contemporary = ['Instrument Sans', 'Bricolage Grotesque', 'Familjen Grotesk', 'Schibsted Grotesk', 'Onest', 'Young Serif', 'Instrument Serif', 'Martian Mono', 'Science Gothic', 'Commissioner', 'Recursive', 'Anybody'];
  const variable = ['Inter Variable', 'Roboto Flex', 'Outfit Variable', 'Manrope Variable', 'Sora Variable', 'Fraunces Variable'];
  const unique = ['Orbitron', 'Exo 2', 'Audiowide', 'Electrolize', 'Michroma', 'Saira Condensed', 'Saira Extra Condensed', 'Teko', 'Pathway Gothic One', 'Aldrich', 'Jura', 'Quantico'];
  
  if (sansSerif.includes(fontName)) return 'sans-serif';
  if (serif.includes(fontName)) return 'serif';
  if (display.includes(fontName)) return 'display';
  if (monospace.includes(fontName)) return 'monospace';
  if (contemporary.includes(fontName)) return 'contemporary';
  if (variable.includes(fontName)) return 'variable';
  if (unique.includes(fontName)) return 'unique';
  if (fontshare.includes(fontName)) {
    // Determine which fontshare category
    const primary = ['Satoshi', 'Clash Display', 'Cabinet Grotesk', 'General Sans', 'Chillax', 'Switzer', 'Ranade'];
    const secondary = ['Boska', 'Gambarino', 'Panchang', 'Melodrama', 'Erode', 'Sentient'];
    const extended = ['Khand', 'Telma'];
    
    if (primary.includes(fontName)) return 'fontshare';
    if (secondary.includes(fontName)) return 'fontshare-secondary';
    if (extended.includes(fontName)) return 'fontshare-extended';
    return 'fontshare-tertiary';
  }
  if (design.includes(fontName)) return 'design-primary';
  
  // Default to design fonts
  return 'design-primary';
};

/**
 * Extract all font families from a deck
 * @param deck The complete deck data
 * @returns Array of font family names used in the deck
 */
export const extractFontFamiliesFromDeck = (deck: any): string[] => {
  if (!deck || !deck.slides || !Array.isArray(deck.slides)) {
    return [];
  }
  
  const fontFamilies = new Set<string>();
  
  // Process each slide
  deck.slides.forEach((slide: any) => {
    // Process slide components
    if (slide.components && Array.isArray(slide.components)) {
      slide.components.forEach((component: any) => {
        if (component?.props?.fontFamily) {
          fontFamilies.add(component.props.fontFamily);
        }
        
        // Check for any nested text content that might have font specifications
        if (component?.props?.content && typeof component.props.content === 'string') {
          // Simple regex to extract font-family from inline styles
          const fontRegex = /font-family:\s*['"]([^'"]+)['"]/g;
          let match;
          while ((match = fontRegex.exec(component.props.content)) !== null) {
            if (match[1]) {
              fontFamilies.add(match[1]);
            }
          }
        }
      });
    }
    
    // Don't forget the background component which might have text
    if (slide.background?.props?.fontFamily) {
      fontFamilies.add(slide.background.props.fontFamily);
    }
  });
  
  // Convert the Set to an array of unique font families
  return Array.from(fontFamilies).filter(font => font && font !== 'inherit' && font !== 'initial');
};

/**
 * Create a font preload link for the most critical fonts
 * To be used in the document head for optimal loading
 */
export const createFontPreloadLinks = (): HTMLLinkElement[] => {
  const criticalFonts = [
    'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2',
    'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2'
  ];
  
  return criticalFonts.map(url => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    return link;
  });
};