import { CompleteDeckData } from "../types/DeckTypes";
import { SlideData } from "../types/SlideTypes";
import { ComponentInstance } from "../types/components";
import { DeckDiff, SlideDiff, ComponentDiff } from "./apiUtils";
import { createBlankSlide, mergeComponents } from "./slideUtils";

// Determine if a props object targets background-related fields
function isBackgroundProps(props: any): boolean {
  if (!props || typeof props !== 'object') return false;
  const bgKeys = new Set([
    'backgroundColor',
    'backgroundType',
    'gradient',
    'backgroundImageUrl',
    'backgroundImageSize',
    'backgroundImageRepeat',
    'backgroundImageOpacity',
    'patternType',
    'patternColor',
    'patternScale',
    // Common alternates
    'color',
    'background',
  ]);
  const keys = Object.keys(props);
  if (keys.some((k) => bgKeys.has(k))) return true;
  // Look into nested style/styles shapes used by agent tool-calling
  const style = (props as any).style || (props as any).styles || null;
  if (style && typeof style === 'object') {
    const sKeys = Object.keys(style);
    if (sKeys.includes('background') || sKeys.includes('backgroundColor')) return true;
    const nestedBackground = (style as any).background;
    if (nestedBackground && (typeof nestedBackground === 'string' || typeof nestedBackground === 'object')) return true;
  }
  return false;
}

// Determine if a props object targets text-related fields
function isTextProps(props: any): boolean {
  if (!props || typeof props !== 'object') return false;
  const textKeys = new Set([
    'texts',
    'textColor',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'alignment',
    'textAlign'
  ]);
  return Object.keys(props).some((k) => textKeys.has(k));
}

/**
 * Validates a component diff to ensure it has required fields
 * @param diff The component diff to validate
 * @returns True if valid, false otherwise
 */
function isValidComponentDiff(diff: ComponentDiff): boolean {
  // Must have an ID
  if (!diff || typeof diff.id !== 'string' || diff.id.trim() === '') {
    return false;
  }
  
  // Optional type must be string if present
  if (diff.type !== undefined && (typeof diff.type !== 'string' || diff.type.trim() === '')) {
    return false;
  }
  
  // Props must be an object if present
  if (diff.props !== undefined && (!diff.props || typeof diff.props !== 'object')) {
    return false;
  }
  
  return true;
}

/**
 * Validates a slide diff to ensure it has required fields
 * @param diff The slide diff to validate
 * @returns True if valid, false otherwise
 */
function isValidSlideDiff(diff: SlideDiff): boolean {
  // Must have a slide ID
  if (!diff || typeof diff.slide_id !== 'string' || diff.slide_id.trim() === '') {
    return false;
  }
  
  // Validate slide properties if present
  if (diff.slide_properties !== undefined && 
      (!diff.slide_properties || typeof diff.slide_properties !== 'object')) {
    return false;
  }
  
  // Validate components to update if present
  if (diff.components_to_update !== undefined) {
    if (!Array.isArray(diff.components_to_update)) {
      return false;
    }
    
    // Each component diff must be valid
    for (const compDiff of diff.components_to_update) {
      if (!isValidComponentDiff(compDiff)) {
        return false;
      }
    }
  }
  
  // Validate components to add if present
  if (diff.components_to_add !== undefined) {
    if (!Array.isArray(diff.components_to_add)) {
      return false;
    }
    
    // Each component must be a valid component instance
    for (const comp of diff.components_to_add) {
      if (!comp || typeof comp.id !== 'string' || !comp.type || typeof comp.props !== 'object') {
        return false;
      }
    }
  }
  
  // Validate components to remove if present
  if (diff.components_to_remove !== undefined) {
    if (!Array.isArray(diff.components_to_remove)) {
      return false;
    }
    
    // Each ID must be a non-empty string
    for (const id of diff.components_to_remove) {
      if (typeof id !== 'string' || id.trim() === '') {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Validates a deck diff to ensure it has the correct structure
 * @param diff The deck diff to validate
 * @returns True if valid, false otherwise
 */
function isValidDeckDiff(diff: DeckDiff): boolean {
  // Empty diff is technically valid but useless
      if (!diff || typeof diff !== 'object') {
    return false;
  }
  
  // Validate deck properties if present
  if (diff.deck_properties !== undefined && 
      (!diff.deck_properties || typeof diff.deck_properties !== 'object')) {
    return false;
  }
  
  // Validate slides to update if present
    if (diff.slides_to_update !== undefined) {
    if (!Array.isArray(diff.slides_to_update)) {
      return false;
    }
    
    // Each slide diff must be valid
    for (const slideDiff of diff.slides_to_update) {
      if (!isValidSlideDiff(slideDiff)) {
        return false;
      }
    }
  }
  
  // Validate slides to add if present
  if (diff.slides_to_add !== undefined) {
    if (!Array.isArray(diff.slides_to_add)) {
      return false;
    }
    
    // Each slide must be a valid slide data object
    for (const slide of diff.slides_to_add) {
      if (!slide || typeof slide.id !== 'string' || typeof slide.title !== 'string') {
        return false;
      }
    }
  }
  
  // Validate slides to remove if present
  if (diff.slides_to_remove !== undefined) {
    if (!Array.isArray(diff.slides_to_remove)) {
      return false;
    }
    
    // Each ID must be a non-empty string
    for (const id of diff.slides_to_remove) {
      if (typeof id !== 'string' || id.trim() === '') {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Deep merges two objects together
 * @param target The target object to merge into
 * @param source The source object to merge from
 * @returns A new object with properties from both objects deeply merged
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  if (!target) return source;
  
  const result = { ...target };
  
  Object.keys(source).forEach(key => {
    if (source[key] === null) {
      // Handle null values (remove the property)
      delete result[key];
    } else if (
      typeof source[key] === 'object' && 
      !Array.isArray(source[key]) && 
      source[key] !== null &&
      typeof target[key] === 'object' && 
      !Array.isArray(target[key]) && 
      target[key] !== null
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(target[key], source[key]);
    } else {
      // For arrays or primitive values, replace completely
      result[key] = source[key];
    }
  });
  
  return result;
}

/**
 * Apply component updates to a component based on a diff
 * @param component The original component to update
 * @param diff The diff containing changes to apply
 * @returns A new component with changes applied
 */
function applyComponentDiff(component: ComponentInstance, diff: ComponentDiff): ComponentInstance {
  if (!component || !diff) {
    return component;
  }

  const updatedComponent: ComponentInstance = {
    ...component,
  };

  // Apply type change if provided
  if (diff.type && diff.type !== component.type) {
    updatedComponent.type = diff.type;
  }

  // Apply prop changes if provided
  if (diff.props && Object.keys(diff.props).length > 0) {
    updatedComponent.props = deepMerge(component.props, diff.props);
  }

  return updatedComponent;
}

/**
 * Apply component updates to a slide based on a slide diff
 * @param slide The slide to update
 * @param slideDiff The diff containing component changes
 * @returns A new slide with component changes applied
 */
function applyComponentUpdates(slide: SlideData, slideDiff: SlideDiff): SlideData {
  const updatedSlide = { ...slide };

  // Ensure components array exists
  if (!updatedSlide.components) {
    updatedSlide.components = [];
  }

  // Apply components to update
  if (slideDiff.components_to_update && slideDiff.components_to_update.length > 0) {
    let updatedComponents = [...updatedSlide.components];
    // Track which target component IDs we have already mapped to during this update pass,
    // so multiple updates don't overwrite the same element when IDs are missing/incorrect.
    const usedAssignedIds = new Set<string>();

    slideDiff.components_to_update.forEach(componentDiff => {
      // Find the component to update by ID
      const componentIndex = updatedComponents.findIndex(c => c.id === componentDiff.id);
      
      if (componentIndex >= 0) {
        // Component found - apply the diff directly
        console.log('[DeckDiff] Updating component', {
          slideId: slide.id,
          componentId: componentDiff.id,
          propsKeys: componentDiff.props ? Object.keys(componentDiff.props) : []
        });
        
        const updatedComponent = applyComponentDiff(updatedComponents[componentIndex], componentDiff);
        updatedComponents[componentIndex] = updatedComponent;
        usedAssignedIds.add(updatedComponents[componentIndex].id);
      } else {
        // Component not found - try a best-effort fallback mapping
        const propsCandidate: any = componentDiff?.props || {};
        const looksBackground = (
          (componentDiff?.type === 'Background') ||
          ('backgroundColor' in propsCandidate) ||
          ('backgroundImageUrl' in propsCandidate) ||
          ('gradient' in propsCandidate) ||
          ('backgroundType' in propsCandidate) ||
          ('patternType' in propsCandidate) ||
          (propsCandidate?.style && 'background' in propsCandidate.style)
        );

        // If this looks like a text style broadcast (common fast-path) and the id looks like a slide id,
        // apply to ALL text-like components on the slide for instant realtime feedback.
        const idLooksSlide = componentDiff?.id === slide.id || String(componentDiff?.id || '').startsWith('slide-');
        const textStyleKeys = ['textColor','color','font','fontFamily','fontWeight','fontSize','letterSpacing','lineHeight','alignment','verticalAlignment'];
        const looksTextStyle = Object.keys(propsCandidate || {}).some(k => textStyleKeys.includes(k));
        if (!looksBackground && idLooksSlide && looksTextStyle) {
          const textTypes = new Set(['TiptapTextBlock','TextBlock','ShapeWithText']);
          let updatedCount = 0;
          updatedComponents = updatedComponents.map(c => {
            if (textTypes.has(c.type)) {
              updatedCount++;
              return applyComponentDiff(c, componentDiff);
            }
            return c;
          });
          console.log('[DeckDiff] Applied broadcast text style update to all text components', {
            slideId: slide.id,
            totalUpdated: updatedCount
          });
          return; // move to next componentDiff
        }

        let candidateIndex = -1;
        if (looksBackground) {
          // Prefer an existing Background component
          candidateIndex = updatedComponents.findIndex(c => (
            (c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background'))) && !usedAssignedIds.has(c.id)
          ));
          if (candidateIndex === -1) {
            // Create a minimal Background component if missing
            const newBg = {
              id: `background-${slide.id}`,
              type: 'Background',
              props: {}
            } as any;
            console.log('[DeckDiff] Creating Background component for fallback update', { slideId: slide.id, componentId: newBg.id });
            updatedComponents = [newBg, ...updatedComponents];
            candidateIndex = 0;
          }
        }

        if (candidateIndex === -1) {
          // Heuristics for non-background updates: prefer text-like components, else highest z-index non-background
          const priorityTypes = new Set(['TiptapTextBlock', 'TextBlock', 'ShapeWithText']);
          const nonBackground = updatedComponents.filter(c => (
            !(c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background')))
          ));
          // If diff.type is present, try to match that type first
          const desiredType = componentDiff?.type || null;
          if (desiredType) {
            candidateIndex = updatedComponents.findIndex(c => c.type === desiredType && !usedAssignedIds.has(c.id));
          }
          if (candidateIndex === -1) {
            // Prefer priority types that are not yet used
            candidateIndex = updatedComponents.findIndex(c => priorityTypes.has(c.type) && !usedAssignedIds.has(c.id));
          }
          if (candidateIndex === -1 && nonBackground.length > 0) {
            let maxZ = -Infinity; let idx = -1;
            nonBackground.forEach((c, i) => {
              if (usedAssignedIds.has(c.id)) return;
              const z = Number((c as any).props?.zIndex) || 0;
              if (z > maxZ) { maxZ = z; idx = i; }
            });
            candidateIndex = idx >= 0 ? updatedComponents.findIndex(c => c.id === nonBackground[idx].id) : -1;
          } else if (candidateIndex !== -1) {
            const type = nonBackground[candidateIndex].type;
            const sameType = nonBackground.filter(c => c.type === type);
            let maxZ = -Infinity; let chosenId: string | null = null;
            sameType.forEach(c => {
              if (usedAssignedIds.has(c.id)) return;
              const z = Number((c as any).props?.zIndex) || 0;
              if (z > maxZ) { maxZ = z; chosenId = c.id; }
            });
            if (chosenId) candidateIndex = updatedComponents.findIndex(c => c.id === chosenId);
          }
        }

        if (candidateIndex >= 0) {
          console.log('[DeckDiff] Fallback mapping component update', {
            slideId: slide.id,
            requestedComponentId: componentDiff.id,
            mappedToComponentId: updatedComponents[candidateIndex].id,
            mappedType: updatedComponents[candidateIndex].type
          });
          const updatedComponent = applyComponentDiff(updatedComponents[candidateIndex], componentDiff);
          updatedComponents[candidateIndex] = updatedComponent;
          usedAssignedIds.add(updatedComponents[candidateIndex].id);
        } else {
          console.log('[DeckDiff] Component not found for update', { slideId: slide.id, componentId: componentDiff.id });
        }
      }
    });

    updatedSlide.components = updatedComponents;
  }

  // Apply components to add
  if (slideDiff.components_to_add && slideDiff.components_to_add.length > 0) {
    // Filter out invalid components and those with duplicate IDs
    const existingComponentIds = new Set(updatedSlide.components.map(c => c.id));
    const validComponentsToAdd = slideDiff.components_to_add.filter(comp => {
      return comp && comp.id && comp.type && !existingComponentIds.has(comp.id);
    });
    console.log('[DeckDiff] Components to add', {
      slideId: slide.id,
      requested: (slideDiff.components_to_add || []).length,
      valid: validComponentsToAdd.length,
    });

    // Merge new components with existing ones
    if (validComponentsToAdd.length > 0) {
      updatedSlide.components = mergeComponents(updatedSlide.components, validComponentsToAdd as ComponentInstance[]);
    }
  }

  // Apply components to remove
  if (slideDiff.components_to_remove && slideDiff.components_to_remove.length > 0) {
    const idsToRemove = new Set(slideDiff.components_to_remove);
    console.log('[DeckDiff] Components to remove', {
      slideId: slide.id,
      count: idsToRemove.size,
    });
    updatedSlide.components = updatedSlide.components.filter(comp => !idsToRemove.has(comp.id));
  }

  return updatedSlide;
}

/**
 * Apply slide updates to a deck based on a deck diff
 * @param deck The deck to update
 * @param deckDiff The diff containing slide changes
 * @returns A new deck with slide changes applied
 */
function applySlideUpdates(deck: CompleteDeckData, deckDiff: DeckDiff): CompleteDeckData {
  let updatedDeck = { ...deck };

  // Ensure slides array exists
  if (!updatedDeck.slides) {
    updatedDeck.slides = [];
  }

  // Apply slides to update
  if (deckDiff.slides_to_update && deckDiff.slides_to_update.length > 0) {
    const updatedSlides = [...updatedDeck.slides];
    
    deckDiff.slides_to_update.forEach(slideDiff => {
      // Find the slide to update
      const slideIndex = updatedSlides.findIndex(s => s.id === slideDiff.slide_id);
      if (slideIndex >= 0) {
        let updatedSlide = { ...updatedSlides[slideIndex] };
        
        // Apply slide property changes directly
        if (slideDiff.slide_properties) {
          updatedSlide = {
            ...updatedSlide,
            ...slideDiff.slide_properties
          };
          console.log('[DeckDiff] Applied slide properties', {
            slideId: updatedSlide.id,
            propsKeys: Object.keys(slideDiff.slide_properties)
          });
        }
        
        // Apply component changes
        updatedSlide = applyComponentUpdates(updatedSlide, slideDiff);
        
        // Update the slide in the array
        updatedSlides[slideIndex] = updatedSlide;
      }
    });
    
    updatedDeck.slides = updatedSlides;
  }
  
  // Apply slides to add
  if (deckDiff.slides_to_add && deckDiff.slides_to_add.length > 0) {
    // Filter out invalid slides and those with duplicate IDs
    const existingSlideIds = new Set(updatedDeck.slides.map(s => s.id));
    const validSlidesToAdd = deckDiff.slides_to_add
      .filter(slide => slide && typeof slide.id === 'string' && !existingSlideIds.has(slide.id))
      .map(slide => {
        // If slide is missing necessary properties, ensure it's complete
        if (!slide.components) {
          // Create a blank slide and merge properties from the provided slide
          const blankSlide = createBlankSlide({ title: slide.title || 'New Slide' });
          return {
            ...blankSlide,
            ...slide,
            id: slide.id  // Ensure ID is preserved
          };
        }
        return slide;
      });
    
    if (validSlidesToAdd.length > 0) {
      updatedDeck.slides = [...updatedDeck.slides, ...validSlidesToAdd];
    }
  }
  
  // Apply slides to remove
  if (deckDiff.slides_to_remove && deckDiff.slides_to_remove.length > 0) {
    const slideIdsToRemove = new Set(deckDiff.slides_to_remove);
    updatedDeck.slides = updatedDeck.slides.filter(slide => !slideIdsToRemove.has(slide.id));
  }

  return updatedDeck;
}

/**
 * Recursively removes null values from an object
 * @param obj The object to clean
 * @returns A new object with null values removed
 */
function removeNullValuesRecursive(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (typeof obj !== 'object' || obj instanceof Date) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeNullValuesRecursive(item))
      .filter(item => item !== undefined);
  }
  
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const cleanedValue = removeNullValuesRecursive(value);
    if (cleanedValue !== undefined) {
      result[key] = cleanedValue;
    }
  }
  
  return result;
}

/**
 * Removes null values from props in component diffs
 * @param diff The deck diff to clean
 * @returns A new deck diff with null values removed from props
 */
function removeNullValuesFromProps(diff: DeckDiff): DeckDiff {
  if (!diff) return diff;
  
  const cleanedDiff = { ...diff };
  
  // Clean slides_to_update
  if (cleanedDiff.slides_to_update && Array.isArray(cleanedDiff.slides_to_update)) {
    cleanedDiff.slides_to_update = cleanedDiff.slides_to_update.map(slideDiff => {
      const cleanedSlideDiff = { ...slideDiff };
      
      // Clean components_to_update
      if (cleanedSlideDiff.components_to_update && Array.isArray(cleanedSlideDiff.components_to_update)) {
        cleanedSlideDiff.components_to_update = cleanedSlideDiff.components_to_update.map(compDiff => {
          const cleanedCompDiff = { ...compDiff };
          
          // Remove null values from props recursively
          if (cleanedCompDiff.props && typeof cleanedCompDiff.props === 'object') {
            cleanedCompDiff.props = removeNullValuesRecursive(cleanedCompDiff.props);
          }
          
          return cleanedCompDiff;
        });
      }
      
      return cleanedSlideDiff;
    });
  }
  
  // Clean components_to_add in slides_to_add
  if (cleanedDiff.slides_to_add && Array.isArray(cleanedDiff.slides_to_add)) {
    cleanedDiff.slides_to_add = cleanedDiff.slides_to_add.map(slide => {
      const cleanedSlide = { ...slide };
      
      if (cleanedSlide.components && Array.isArray(cleanedSlide.components)) {
        cleanedSlide.components = cleanedSlide.components.map(comp => {
          const cleanedComp = { ...comp };
          
          if (cleanedComp.props && typeof cleanedComp.props === 'object') {
            cleanedComp.props = removeNullValuesRecursive(cleanedComp.props);
          }
          
          return cleanedComp;
        });
      }
      
      return cleanedSlide;
    });
  }
  
  return cleanedDiff;
}

/**
 * Applies a deck diff to a deck in a pure functional way
 * @param deck The deck to apply changes to
 * @param diff The diff containing changes to apply
 * @returns A new deck with all changes applied
 */
export function applyDeckDiffPure(deck: CompleteDeckData, diff: DeckDiff): CompleteDeckData {
  try {
    // Clean the diff by removing null values from props
    const cleanedDiff = removeNullValuesFromProps(diff);
    
    // Return original deck if no diff or invalid diff
    if (!cleanedDiff || !isValidDeckDiff(cleanedDiff)) {
      console.warn("Invalid or empty deck diff provided", diff);
      return deck;
    }

    // Diagnostic summary
    try {
      const slideUpdates = cleanedDiff.slides_to_update || [];
      console.log('[DeckDiff] Applying diff summary', {
        deckProps: cleanedDiff.deck_properties ? Object.keys(cleanedDiff.deck_properties) : [],
        slidesToUpdate: slideUpdates.length,
        slidesToAdd: (cleanedDiff.slides_to_add || []).length,
        slidesToRemove: (cleanedDiff.slides_to_remove || []).length,
        componentsPerSlide: slideUpdates.map(s => ({
          slideId: s.slide_id,
          updateCount: (s.components_to_update || []).length,
          addCount: (s.components_to_add || []).length,
          removeCount: (s.components_to_remove || []).length,
        }))
      });
    } catch {}

    // Make a deep copy of the deck to avoid mutations
    let updatedDeck: CompleteDeckData = JSON.parse(JSON.stringify(deck));

    // Check if the diff has any changes at all
    const hasDeckProperties = cleanedDiff.deck_properties && Object.keys(cleanedDiff.deck_properties).length > 0;
    const hasSlidesToUpdate = cleanedDiff.slides_to_update && cleanedDiff.slides_to_update.length > 0;
    const hasSlidesToAdd = cleanedDiff.slides_to_add && cleanedDiff.slides_to_add.length > 0;
    const hasSlidesToRemove = cleanedDiff.slides_to_remove && cleanedDiff.slides_to_remove.length > 0;

    // If no changes, return the original deck
    if (!hasDeckProperties && !hasSlidesToUpdate && !hasSlidesToAdd && !hasSlidesToRemove) {
      return deck;
    }

    // Apply deck property changes
    if (hasDeckProperties) {
      // Define protected properties that shouldn't be overwritten
      const protectedProps = ['uuid', 'version', 'slides'];
      
      // Apply changes to non-protected properties
      updatedDeck = {
        ...updatedDeck,
        ...Object.fromEntries(
          Object.entries(cleanedDiff.deck_properties || {}).filter(([key]) => !protectedProps.includes(key))
        )
      };
    }

    // Apply slide changes
    if (hasSlidesToUpdate || hasSlidesToAdd || hasSlidesToRemove) {
      updatedDeck = applySlideUpdates(updatedDeck, cleanedDiff);
    }

    // Update lastModified timestamp if changes were made
    updatedDeck.lastModified = new Date().toISOString();

    return updatedDeck;
  } catch (error) {
    console.error("Error applying deck diff:", error);
    return deck; // Return original deck on error
  }
}

/**
 * Creates a component update diff
 * @param componentId The ID of the component to update
 * @param props The properties to update
 * @param newType Optional new type for the component
 * @returns A ComponentDiff object
 */
export function createComponentUpdateDiff(
  componentId: string,
  props: Record<string, any>,
  newType?: string
): ComponentDiff {
  const diff: ComponentDiff = { id: componentId };
  
  if (props && Object.keys(props).length > 0) {
    diff.props = props;
  }
  
  if (newType) {
    diff.type = newType;
  }
  
  return diff;
}

/**
 * Creates a slide diff for updating specific components
 * @param slideId The ID of the slide to update
 * @param componentDiffs The component diffs to apply
 * @param slideProperties Optional slide properties to update
 * @returns A SlideDiff object
 */
export function createSlideComponentUpdateDiff(
  slideId: string,
  componentDiffs: ComponentDiff[],
  slideProperties?: Partial<SlideData>
): SlideDiff {
  const slideDiff: SlideDiff = { slide_id: slideId };
  
  if (componentDiffs && componentDiffs.length > 0) {
    slideDiff.components_to_update = componentDiffs;
  }
  
  if (slideProperties && Object.keys(slideProperties).length > 0) {
    slideDiff.slide_properties = slideProperties;
  }
  
  return slideDiff;
}

/**
 * Creates a diff for adding a component to a slide
 * @param slideId The ID of the slide to update
 * @param component The component to add
 * @returns A SlideDiff object with the component to add
 */
export function createComponentAddDiff(
  slideId: string,
  component: ComponentInstance
): SlideDiff {
  return {
    slide_id: slideId,
    components_to_add: [component]
  };
}

/**
 * Creates a diff for removing a component from a slide
 * @param slideId The ID of the slide to update
 * @param componentId The ID of the component to remove
 * @returns A SlideDiff object with the component to remove
 */
export function createComponentRemoveDiff(
  slideId: string,
  componentId: string
): SlideDiff {
  return {
    slide_id: slideId,
    components_to_remove: [componentId]
  };
}

/**
 * Creates a diff for adding a slide to a deck
 * @param slide The slide to add
 * @returns A DeckDiff object with the slide to add
 */
export function createSlideAddDiff(slide: SlideData): DeckDiff {
  return {
    slides_to_add: [slide]
  };
}

/**
 * Creates a diff for removing a slide from a deck
 * @param slideId The ID of the slide to remove
 * @returns A DeckDiff object with the slide to remove
 */
export function createSlideRemoveDiff(slideId: string): DeckDiff {
  return {
    slides_to_remove: [slideId]
  };
}