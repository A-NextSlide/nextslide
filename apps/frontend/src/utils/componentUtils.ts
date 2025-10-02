import { ComponentInstance } from "../types/components";
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from './deckUtils';
import { getNextZIndex } from './zIndexUtils';
// Import TypeBox registry
import { registry, createComponent as createTypeBoxComponent, ComponentInstance as TypeBoxComponentInstance } from "../registry";
import { v4 as uuid } from 'uuid';

/**
 * Gets component information by returning both the component registry entry and the component instance
 * 
 * @param componentInstance - The component instance to get information for
 * @returns An object containing the component registry entry and the component instance
 */
export function getComponentInfo(componentInstance: ComponentInstance) {
  if (!componentInstance) {
    throw new Error("Component instance is required");
  }

  // Get the component type from the instance
  const componentType = componentInstance.type;
  
  // Find the registry entry for this component type using TypeBox registry
  const registryEntry = registry.getDefinition(componentType);
  
  if (!registryEntry) {
    throw new Error(`Component type '${componentType}' not found in registry`);
  }

  // Return both the registry entry and component instance in one object
  return {
    // The component definition from the registry
    definition: registryEntry,
    
    // The component instance with its specific props
    instance: componentInstance
  };
}

/**
 * Gets component information in JSON format
 * 
 * @param componentInstance - The component instance to get information for
 * @returns A JSON string containing the component registry entry and the component instance
 */
export function getComponentInfoAsJson(componentInstance: ComponentInstance): string {
  const componentInfo = getComponentInfo(componentInstance);
  return JSON.stringify(componentInfo, null, 2);
}

/**
 * Factory function to create a new component instance with default props applied
 * Using TypeBox registry for type-safe component creation
 * 
 * @param componentType - The type of component to create
 * @param customProps - Custom props to override defaults
 * @param id - Optional custom ID (generates a random ID if not provided)
 * @param slideSize - Optional slide size (defaults to 1920x1080)
 * @returns A new ComponentInstance with default props merged with custom props
 */
export function createComponent(
  componentType: string,
  customProps: Record<string, any> = {},
  id?: string,
  slideSize: { width: number; height: number } = { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT }
): ComponentInstance {
  // Generate a unique ID if one wasn't provided
  const componentId = id || uuid();
  
  // Create a copy of customProps to avoid mutating the input
  const finalProps: Record<string, any> = { ...customProps };
  
  // Get existing components (if provided) for z-index calculation
  const existingComponents = customProps.existingComponents || [];
  // This property shouldn't be stored with the component
  delete finalProps.existingComponents;
  
  // Handle z-index calculation if not explicitly provided
  if (finalProps.zIndex === undefined) {
    if (componentType === 'Background') {
      finalProps.zIndex = 0; // Background always at bottom (z-index 0)
    } else if (existingComponents.length > 0) {
      // Calculate the next z-index based on existing components
      finalProps.zIndex = getNextZIndex(existingComponents);
    }
    // If no z-index is specified and no existing components,
    // the TypeBox registry default will be used
  }
  
  // Only add animation trigger for charts if needed
  if (componentType === 'Chart') {
    // Don't automatically add animation trigger - let it be added explicitly when needed
    // Inject default data/colors for new chart instances when none provided
    try {
      // Require registry utils to avoid import cycles
      const { getChartTypeDefaults } = require('../registry/utils');
      const chartType = finalProps.chartType;
      const defaults = getChartTypeDefaults(chartType);
      /**
       * Inject default data & colors
       *
       * We deliberately look at the *incoming* customProps (now held in `finalProps`).
       * If the caller already supplied `data` or `colors` we must respect that.
       *
       * However, the previous logic only filled data when it was strictly
       * empty (undefined / []). This caused an edge‑case when the component
       * definition itself (ChartDefinition) provided default data for the
       * initial `bar` chart type. When callers created a chart of another
       * type (e.g. `heatmap`) without explicitly passing `data`, the old
       * `bar` sample data was still present, leading to confusing Category A,
       * Category B … values.
       *
       * The fix: we only treat `data` or `colors` as *user‑supplied* if they
       * are present on the incoming custom props. If they are absent, we
       * always replace them with the defaults that match the requested
       * `chartType`.
       */

      const customProvidedData = Object.prototype.hasOwnProperty.call(customProps, 'data');
      if (!customProvidedData) {
        finalProps.data = Array.isArray(defaults.data) ? defaults.data : [];
      }

      const customProvidedColors = Object.prototype.hasOwnProperty.call(customProps, 'colors');
      if (!customProvidedColors) {
        finalProps.colors = defaults.colors;
      }
    } catch {
      // ignore if utils import fails
    }
  }
  
  // Create the component using TypeBox registry
  const typeBoxComponent = createTypeBoxComponent(componentType, componentId, finalProps);
  
  if (!typeBoxComponent) {
    throw new Error(`Failed to create component of type '${componentType}'`);
  }
  
  // Convert to the expected ComponentInstance format if needed
  // This is for compatibility with existing code until fully migrated
  const componentInstance: ComponentInstance = typeBoxComponent as unknown as ComponentInstance;
  
  return componentInstance;
}

/**
 * Creates a background component for slides
 * Leverages the TypeBox registry for defaults
 * 
 * @param color - Optional background color (defaults to white)
 * @param id - Optional custom ID
 * @param slideSize - Optional slide dimensions
 * @returns A new Background component instance
 */
export function createBackgroundComponent(
  color?: string,
  id?: string,
  slideSize: { width: number; height: number } = { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT }
): ComponentInstance {
  const props: Record<string, any> = {
    position: { x: 0, y: 0 },
    width: slideSize.width,
    height: slideSize.height,
    zIndex: 0
  };
  
  // Only override color if specified, otherwise use registry default
  if (color) {
    props.color = color;
  }
  
  return createComponent("Background", props, id || uuid());
}

// Maintain backward compatibility for existing code
export const createDefaultBackground = createBackgroundComponent; 