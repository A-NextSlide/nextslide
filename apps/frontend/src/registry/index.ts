// Re-export from schemas.ts
export {
  UIProperty,
  UIObject,
  UIArray,
  UIEnum,
  hasUIControl,
  getControlMetadata,
  createDefaultValue,
  type ControlType,
  type ControlMetadata,
  type TypeFromSchema,
  type BaseControlProps,
  type InputControlProps,
  type TextareaControlProps,
  type SliderControlProps,
  type DropdownControlProps,
  type GroupedDropdownControlProps,
  type EditableDropdownControlProps,
  type ColorPickerControlProps
} from './schemas';

// Re-export from base.ts
export {
  BaseComponentSchema,
  type BaseComponentProps,
  baseComponentDefaults
} from './base';

// Re-export from registry.ts
export {
  registry,
  type ComponentDefinition,
  type ComponentInstance,
  createComponentInstance
} from './registry';

// Re-export fonts library
export {
  FONT_CATEGORIES,
  type FontDefinition,
  ALL_FONT_NAMES,
  COMMON_FONTS
} from './library/fonts';

// Re-export property groups
export {
  LAYOUT_PROPERTIES,
  BACKGROUND_PROPERTIES,
  SHADOW_PROPERTIES,
  BORDER_PROPERTIES,
  TEXT_PROPERTIES,
  CHART_PROPERTIES,
  TABLE_PROPERTIES,
  IMAGE_PROPERTIES,
  isPropertyInGroup,
  isCategorizedProperty
} from './library/property-groups';

// Re-export from utils.ts
export {
  getEnhancedControlMetadata,
  createControlMetadataFactory,
  isPropertySupportedForChartType,
  getChartTypeDefaults
} from './utils';

// Import components to ensure registration
import './components';
import { registry } from './registry';
import { TSchema } from '@sinclair/typebox';
import { createLogger, LogCategory } from '@/utils/logging';

// Create a proper logger for the registry
const logger = createLogger(LogCategory.REGISTRY);

/**
 * Initialize the TypeBox registry system
 */
export function initializeRegistry() {
  // This function is called to ensure the registry is initialized
  // Components are auto-registered when imported above
  const componentCount = registry.getAllDefinitions().length;
  // Registry loaded successfully
}

/**
 * Get a component definition from the registry
 */
export function getComponentDefinition<T extends TSchema>(type: string) {
  return registry.getDefinition<T>(type);
}

/**
 * Create a component instance from the registry
 */
export function createComponent<T extends TSchema>(type: string, id: string, overrideProps: Record<string, any> = {}) {
  return registry.createInstance<T>(type, id, overrideProps);
}

// Initialize the registry when this module is imported
initializeRegistry(); 