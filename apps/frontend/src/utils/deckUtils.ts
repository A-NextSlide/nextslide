import { CompleteDeckData, SlideData } from '../types/DeckTypes';
import { v4 as uuidv4 } from 'uuid';
import { createBlankSlide } from '../utils/slideUtils';

// Default dimensions for slides (1920x1080 pixels - 16:9 HD)
export const DEFAULT_SLIDE_WIDTH = 1920;
export const DEFAULT_SLIDE_HEIGHT = 1080;

/**
 * Creates a sample deck with demo slides for first-time users
 * @param deckId - Unique identifier for the deck
 * @returns A complete deck data object with sample slides
 */
export const createSampleDeck = (deckId: string): CompleteDeckData => {
  return {
    uuid: deckId,
    name: 'Interactive Presentation',
    size: {
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT
    },
    slides: [
      {
        id: 'slide-intro',
        deckId: deckId,
        title: 'Welcome to Interactive Slide Sorcery',
        order: 0,
        status: 'completed' as const,
        components: [
          {
            id: 'intro-title',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Interactive Slide Sorcery',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 32,
              fontFamily: 'Arial',
              position: { x: 760, y: 324 },
              width: 800,
              height: 150,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent'
            }
          },
          {
            id: 'intro-subtitle',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Create interactive presentations with real-time components',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 18,
              fontFamily: 'Arial',
              position: { x: 50, y: 45 },
              width: 80,
              height: 10,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent'
            }
          },
          {
            id: 'intro-image',
            type: 'Image',
            props: {
              src: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80',
              alt: 'Interactive presentation',
              position: { x: 50, y: 70 },
              width: 60,
              height: 30,
              objectFit: 'cover',
              borderRadius: 8
            }
          }
        ]
      },
      {
        id: 'slide-features',
        deckId: deckId,
        title: 'Key Features',
        order: 1,
        status: 'completed' as const,
        components: [
          {
            id: 'features-title',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Key Features',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 28,
              fontFamily: 'Arial',
              position: { x: 50, y: 20 },
              width: 80,
              height: 10,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent'
            }
          },
          {
            id: 'feature-1',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: '• Real-time collaborative editing',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 18,
              fontFamily: 'Arial',
              position: { x: 50, y: 40 },
              width: 80,
              height: 8,
              alignment: 'left',
              verticalAlignment: 'top',
              backgroundColor: 'transparent'
            }
          },
          {
            id: 'feature-2',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: '• Interactive components with live data',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 18,
              fontFamily: 'Arial',
              position: { x: 50, y: 50 },
              width: 80,
              height: 8,
              alignment: 'left',
              verticalAlignment: 'top',
              backgroundColor: 'transparent'
            }
          },
          {
            id: 'feature-3',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: '• Customizable templates and themes',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 18,
              fontFamily: 'Arial',
              position: { x: 50, y: 60 },
              width: 80,
              height: 8,
              alignment: 'left',
              verticalAlignment: 'top',
              backgroundColor: 'transparent'
            }
          },
          {
            id: 'cta-button',
            type: 'Shape',
            props: {
              shapeType: 'rectangle',
              fill: '#0ea5e9',
              stroke: 'transparent',
              strokeWidth: 0,
              position: { x: 50, y: 80 },
              width: 30,
              height: 10
            }
          },
          {
            id: 'button-text',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Get Started',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 36,
              fontFamily: 'Arial',
              textColor: '#ffffff',
              position: { x: 50, y: 80 },
              width: 30,
              height: 10,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent'
            }
          }
        ]
      },
      {
        id: 'slide-demo',
        deckId: deckId,
        title: 'Interactive Demo',
        order: 2,
        status: 'completed' as const,
        components: [
          {
            id: 'demo-title',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Try It Yourself',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 60,
              fontFamily: 'Arial',
              position: { x: 50, y: 20 },
              width: 800,
              height: 100,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent',
              lineHeight: 1.2
            }
          },
          {
            id: 'demo-description',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Add your own slides and components to create an engaging presentation',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 36,
              fontFamily: 'Arial',
              position: { x: 50, y: 140 },
              width: 800,
              height: 120,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent',
              lineHeight: 1.2
            }
          },
          {
            id: 'cta-button',
            type: 'Shape',
            props: {
              shapeType: 'rectangle',
              fill: '#0ea5e9',
              stroke: 'transparent',
              strokeWidth: 0,
              position: { x: 200, y: 660 },
              width: 300,
              height: 80,
              borderRadius: 10
            }
          },
          {
            id: 'button-text',
            type: 'TiptapTextBlock',
            props: {
              texts: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Get Started',
                        style: {}
                      }
                    ]
                  }
                ]
              },
              fontSize: 36,
              fontFamily: 'Arial',
              fontWeight: 'bold',
              textColor: '#ffffff',
              position: { x: 200, y: 660 },
              width: 300,
              height: 80,
              alignment: 'center',
              verticalAlignment: 'middle',
              backgroundColor: 'transparent',
              lineHeight: 1.0,
              padding: 0
            }
          }
        ]
      }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lastModified: new Date().toISOString()
  };
};

/**
 * Creates a minimal fallback deck with a single empty slide
 * @param deckId - Unique identifier for the deck
 * @returns A minimal deck data object with a single empty slide
 */

export const createMinimalDeck = (deckId: string): CompleteDeckData => {
  // Create a blank slide with our imported function
  const baseSlide = createBlankSlide({
    title: 'Welcome to your presentation',
    id: 'slide-1'
  });
  
  // Add required SlideData properties
  const newSlide: SlideData = {
    ...baseSlide,
    deckId: deckId,
    order: 0,
    status: 'completed' as const
  };
  
  return {
    uuid: deckId,
    name: 'New Presentation',
    size: {
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT
    },
    slides: [newSlide],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lastModified: new Date().toISOString()
  };
};

/**
 * Creates an empty deck with no slides
 * @param deckId - Unique identifier for the deck
 * @param name - Name of the deck (defaults to "New Deck")
 * @returns An empty deck data object
 */
export const createEmptyDeck = (deckId: string, name: string = 'New Deck'): CompleteDeckData => {
  return {
    uuid: deckId,
    name,
    size: {
      width: DEFAULT_SLIDE_WIDTH,
      height: DEFAULT_SLIDE_HEIGHT
    },
    slides: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lastModified: new Date().toISOString()
  };
};

/**
 * Generates a unique deck ID
 * @returns A unique UUID for a deck
 */
export const generateDeckId = (): string => {
  // Use v4 UUID instead of timestamp-based ID for database compatibility
  return uuidv4();
};

/**
 * Ensures that size values (width/height) are always numeric.
 * Converts string values to numbers and provides sensible defaults.
 * 
 * @param value The width or height value to standardize
 * @param defaultValue The default value to use if parsing fails (defaults to 0)
 * @returns A numeric width or height value
 */
export function standardizeSize(value: unknown, defaultValue: number = 0): number {
  // If value is already a number, just return it
  if (typeof value === 'number') {
    return value;
  }
  
  // If value is a string that can be converted to a number, convert it
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  // For all other cases (null, undefined, objects, etc.), return the default
  return defaultValue;
}

/**
 * Ensures a slide or deck size object has numeric width and height values
 * 
 * @param size The size object to standardize
 * @param defaultWidth Default width if parsing fails
 * @param defaultHeight Default height if parsing fails
 * @returns An object with numeric width and height
 */
export function standardizeSizeObject(
  size: {width?: unknown, height?: unknown} | undefined, 
  defaultWidth: number = DEFAULT_SLIDE_WIDTH,
  defaultHeight: number = DEFAULT_SLIDE_HEIGHT
): {width: number, height: number} {
  if (!size) {
    return { width: defaultWidth, height: defaultHeight };
  }
  
  return {
    width: standardizeSize(size.width, defaultWidth),
    height: standardizeSize(size.height, defaultHeight)
  };
} 
