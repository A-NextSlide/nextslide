
import { SlideData } from "@/types/SlideTypes";
import { CompleteDeckData } from "@/types/DeckTypes";
import { ComponentInstance } from "@/types/components";

/**
 * Extracts components from slides in a deck
 * @param deckNameOrSlides The name of the deck or the slides array
 * @param slidesOptional Optional slides array if first param is deckName
 * @returns CompleteDeckData object
 */
export const extractDeckComponents = (
  deckNameOrSlides: string | SlideData[], 
  slidesOptional?: SlideData[]
): CompleteDeckData => {
  
  // If first param is a string, it's the new format (deckName, slides)
  if (typeof deckNameOrSlides === 'string') {
    const deckName = deckNameOrSlides;
    const slides = slidesOptional || [];
    
    // Create a mapping of component types to empty placeholder code
    const componentCodeMap: Record<string, string> = {};
    
    // Collect all component types
    slides.forEach(slide => {
      if (slide.components) {
        slide.components.forEach(component => {
          // Store a placeholder for the component code
          componentCodeMap[component.type] = `// Placeholder code for ${component.type}`;
        });
      }
    });
    
    return { 
      name: deckName,
      slides: slides,
      components: componentCodeMap,
      styles: {}, // Empty styles
      dependencies: {}, // No dependencies
      version: "1.0.0",
      lastModified: new Date().toISOString()
    };
  } 
  // If first param is an array, it's the old format (just slides)
  else {
    const slides = deckNameOrSlides;
    // Create a complete CompleteDeckData object
    return {
      name: 'Generated Deck',
      slides: slides,
      components: {}, // We'll use an empty record for components
      styles: {},
      dependencies: {},
      version: "1.0.0",
      lastModified: new Date().toISOString()
    };
  }
};

/**
 * Creates a React build script for a deck
 * @param deckName The name of the deck
 * @param components The components used in the deck
 * @returns The build script as a string
 */
export const createReactBuildScript = (deckName: string, components: Record<string, string>): string => {
  return `// Simplified build script for ${deckName}
// This is a placeholder implementation
console.log('Building deck: ${deckName}');
`;
};
