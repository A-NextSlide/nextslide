import { SlideData } from "../types/SlideTypes";
import { ComponentInstance } from "../types/components";
import { createComponent, createDefaultBackground } from "./componentUtils";
import { DEFAULT_SLIDE_HEIGHT, DEFAULT_SLIDE_WIDTH } from "./deckUtils";
import { v4 as uuidv4 } from 'uuid';
import { Theme, initialWorkspaceTheme } from "../types/themes";

// Type for typography style
type TypographyStyle = { color?: string; fontWeight?: string | number };

/**
 * Creates a new blank slide with a default template (Title, Subtitle, Footer) and background.
 * Applies theme properties if a theme is provided.
 */
export const createBlankSlide = (
    slideData: Partial<SlideData> = {},
    backgroundProps?: Record<string, any>,
    currentTheme: Theme = initialWorkspaceTheme
): SlideData => {
    const newSlideId = slideData.id || uuidv4();

    // --- Determine Theme Values --- 
    const themeBgColor = currentTheme.page?.backgroundColor || '#E8F4FD';
    const themeTextColor = currentTheme.typography?.paragraph?.color || '#0481ff';
    const themeFontFamily = currentTheme.typography?.paragraph?.fontFamily || 'Inter';
    const titleColor = currentTheme.typography?.heading?.color || '#0481ff';
    const subtitleColor = currentTheme.typography?.paragraph?.color || '#0481ff';
    const captionStyle = currentTheme.typography && 'caption' in currentTheme.typography 
                         ? currentTheme.typography.caption as TypographyStyle
                         : undefined;
    const footerColor = captionStyle?.color ?? '#0481ff';
    const titleWeight = currentTheme.typography?.heading?.fontWeight || "bold";
    const subtitleWeight = currentTheme.typography?.paragraph?.fontWeight || "normal";
    const footerWeight = captionStyle?.fontWeight ?? subtitleWeight;

    // --- Define Default Background Props (using theme) --- 
    const defaultBgProps = {
        color: themeBgColor,
        gradient: null,
        position: { x: 0, y: 0 },
        width: DEFAULT_SLIDE_WIDTH,
        height: DEFAULT_SLIDE_HEIGHT,
        zIndex: 0
    };

    // Allow specific backgroundProps to override theme defaults
    const finalBgProps = backgroundProps ? { ...defaultBgProps, ...backgroundProps } : defaultBgProps;

    // --- Create Background Component --- 
    const defaultBackground = createComponent('Background', finalBgProps);

    // --- Define Template Text Blocks (using theme) --- 
    const titleComponent = createComponent('TiptapTextBlock', {
        texts: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: "Your Title Here",
                            style: {}
                        }
                    ]
                }
            ]
        },
        fontSize: 96,
        fontFamily: themeFontFamily,
        fontWeight: titleWeight,
        textColor: titleColor,
        position: { x: 160, y: 200 }, 
        width: 800,
        height: 150,
        alignment: "left",
        verticalAlignment: "top",
        lineHeight: 1.1,
        zIndex: 1,
    });

    const subtitleComponent = createComponent('TiptapTextBlock', {
        texts: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: "Your subtitle text goes here",
                            style: {}
                        }
                    ]
                }
            ]
        },
        fontSize: 48,
        fontFamily: themeFontFamily,
        fontWeight: subtitleWeight,
        textColor: subtitleColor,
        position: { x: 160, y: titleComponent.props.position.y + 220 + 20 },
        width: 900,
        height: 150,
        alignment: "left",
        verticalAlignment: "top",
        lineHeight: 1.2,
        zIndex: 2,
    });

    const footerComponent = createComponent('TiptapTextBlock', {
        texts: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: "Author Name - Date",
                            style: {}
                        }
                    ]
                }
            ]
        },
        fontSize: 28,
        fontFamily: themeFontFamily,
        fontWeight: footerWeight,
        textColor: footerColor,
        position: { x: 160, y: DEFAULT_SLIDE_HEIGHT - 80 }, 
        width: 800,
        height: 60,
        alignment: "left",
        verticalAlignment: "middle",
        lineHeight: 1.0,
        padding: 0,
        zIndex: 3,
    });

    // Create the default components array
    const defaultComponents = [
        defaultBackground,
        titleComponent, 
        subtitleComponent, 
        footerComponent
    ];

    // Create the new slide with components handled properly
    const newSlide: SlideData = {
        id: newSlideId,
        title: slideData.title || 'New Slide',
        // Only use slideData.components if explicitly provided, otherwise use defaults
        components: slideData.components || defaultComponents,
        // Add remaining slideData properties (except 'components' which we handled above)
        ...Object.fromEntries(
            Object.entries(slideData).filter(([key]) => key !== 'components')
        )
    };

    return newSlide;
};

/**
 * Adds a new slide to the deck, applying the current theme.
 */
export const addSlide = (
    slides: SlideData[], 
    slide?: Omit<Partial<SlideData>, 'id'>, 
    currentTheme?: Theme
): SlideData[] => {
    const newSlide = createBlankSlide(slide, undefined, currentTheme);
    return [...slides, newSlide];
};

/**
 * Adds a new slide after the specified slide, applying the current theme.
 */
export const addSlideAfter = (
    slides: SlideData[], 
    afterSlideId: string, 
    slide?: Partial<SlideData>,
    currentTheme?: Theme
): SlideData[] => {
    const slideIndex = slides.findIndex(s => s.id === afterSlideId);
    const newSlide = createBlankSlide({ id: uuidv4(), ...slide }, undefined, currentTheme);
    
    if (slideIndex === -1) return [...slides, newSlide];

    const updatedSlides = [...slides];
    updatedSlides.splice(slideIndex + 1, 0, newSlide);
  
    return updatedSlides;
};

/**
 * Updates an existing slide by ID
 */
export const updateSlide = (slides: SlideData[], id: string, data: Partial<SlideData>): SlideData[] => {
  return slides.map((slide) => {
    if (slide.id !== id) return slide;
    
    // Handle transition flags
    const updatedData = { ...data };
    if (data.transition && slide.transition === data.transition) {
      updatedData.transition = undefined;
    }
    
    // Special handling for components - merge rather than replace if both exist
    if (updatedData.components && slide.components) {
      // Create a map of existing components by ID for fast lookup
      const existingComponentsMap = new Map(
        slide.components.map(comp => [comp.id, comp])
      );
      
      // Update with new components, preserving ones not in the update
      updatedData.components = updatedData.components.map(newComp => {
        // If the component already exists, merge it
        const existingComp = existingComponentsMap.get(newComp.id);
        if (existingComp) {
          return {
            ...existingComp,
            ...newComp,
            props: { ...existingComp.props, ...newComp.props }
          };
        }
        // Otherwise, use the new component as is
        return newComp;
      });
      
      // Add any existing components not in the update
      slide.components.forEach(comp => {
        if (!updatedData.components!.some(newComp => newComp.id === comp.id)) {
          updatedData.components!.push(comp);
        }
      });
    }
    
    return { ...slide, ...updatedData };
  });
};

/**
 * Removes a slide from the deck
 */
export const removeSlide = (slides: SlideData[], id: string): SlideData[] => {
  return slides.filter(slide => slide.id !== id);
};

/**
 * Duplicates a slide and adds it after the original
 */
export const duplicateSlide = (slides: SlideData[], id: string): SlideData[] => {
  const slideIndex = slides.findIndex(slide => slide.id === id);
  if (slideIndex === -1) return slides;
  
  const originalSlide = slides[slideIndex];
  
  // Create a deep copy of the slide with a new ID
  const newSlideId = uuidv4();
  
  // Get all components including the background
  let componentsWithNewIds = (originalSlide.components || []).map(comp => ({
    ...comp,
    id: uuidv4(), // Use proper UUID instead of timestamp-based ID
    // Preserve all props exactly as they were
    props: { ...comp.props }
  }));
  
  // Check if there's a background component
  const hasBackgroundComponent = componentsWithNewIds.some(comp => comp.type === "Background");
  
  // Add a background component if needed
  if (!hasBackgroundComponent) {
    componentsWithNewIds = [
      createDefaultBackground('#E8F4FD'),
      ...componentsWithNewIds
    ];
  }
  
  const duplicatedSlide: SlideData = {
    ...JSON.parse(JSON.stringify(originalSlide)), // Deep copy
    id: newSlideId,
    title: `${originalSlide.title} (Copy)`,
    // Create new IDs for components to avoid conflicts
    components: componentsWithNewIds
  };
  
  // Insert the duplicated slide after the original
  const updatedSlides = [...slides];
  updatedSlides.splice(slideIndex + 1, 0, duplicatedSlide);
  
  return updatedSlides;
};

/**
 * Reorders slides by moving a slide from one position to another
 */
export const reorderSlides = (slides: SlideData[], sourceIndex: number, destinationIndex: number): SlideData[] => {
  if (sourceIndex < 0 || sourceIndex >= slides.length || 
      destinationIndex < 0 || destinationIndex >= slides.length || 
      sourceIndex === destinationIndex) {
    return slides;
  }
  
  const updatedSlides = [...slides];
  const [removedSlide] = updatedSlides.splice(sourceIndex, 1);
  updatedSlides.splice(destinationIndex, 0, removedSlide);
  
  return updatedSlides;
};

/**
 * Merges components from two sources, preserving unique IDs
 * @param targetComponents The base components array
 * @param sourceComponents The components to merge in
 * @returns Combined components array with no duplicates
 */
export const mergeComponents = (
  existingComponents: ComponentInstance[],
  newComponents: ComponentInstance[]
): ComponentInstance[] => {
  // Create a map of existing components by ID
  const existingMap = new Map(existingComponents.map(comp => [comp.id, comp]));
  
  // Process new components
  newComponents.forEach(newComp => {
    if (existingMap.has(newComp.id)) {
      // Update existing component
      existingMap.set(newComp.id, newComp);
    } else {
      // Add new component preserving its provided ID; assume upstream ensured uniqueness
      existingMap.set(newComp.id, { ...newComp });
    }
  });
  
  return Array.from(existingMap.values());
};