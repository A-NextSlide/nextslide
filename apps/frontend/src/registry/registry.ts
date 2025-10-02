import { TSchema } from '@sinclair/typebox';
import { TypeFromSchema, createDefaultValue } from './schemas';
import { BaseComponentSchema, baseComponentDefaults } from './base';

/**
 * Registry Component Definition
 * Enhanced with TypeBox schema and types
 */
export interface ComponentDefinition<T extends TSchema = TSchema> {
  /** Unique type identifier for this component */
  type: string;
  
  /** Human-readable display name */
  name: string;
  
  /** Complete TypeBox schema for this component type */
  schema: T;
  
  /** Default property values */
  defaultProps: Partial<TypeFromSchema<T>>;
  
  /** Optional reference to the renderer function */
  renderer?: string;
  
  /** Optional reference to the settings editor component */
  editorComponent?: string;
  
  /** UI category for organization */
  category?: 'basic' | 'media' | 'data' | 'advanced' | 'layout';
}

/**
 * Component Instance using TypeBox schema
 */
export interface ComponentInstance<T extends TSchema = TSchema> {
  /** Unique instance ID */
  id: string;
  
  /** Component type identifier */
  type: string;
  
  /** Properties for this instance */
  props: Partial<TypeFromSchema<T>>;
  
  /** Read-only computed properties */
  readonly?: {
    bounding_box?: { x: number, y: number, width: number, height: number }
  };
}

/**
 * Create a new component instance from a definition
 */
export function createComponentInstance<T extends TSchema>(
  definition: ComponentDefinition<T>, 
  id: string,
  overrideProps: Partial<TypeFromSchema<T>> = {}
): ComponentInstance<T> {
  // Create default props from schema
  const schemaDefaults = createDefaultValue(definition.schema) as Record<string, any>;
  
  // Debug logging removed
  
  // Merge with definition defaults and overrides
  // IMPORTANT: Only apply defaults if the property is not explicitly set in overrides
  const props: Record<string, any> = {
    ...schemaDefaults,
    ...(definition.defaultProps as Record<string, any>)
  };
  
  // Apply overrides, including undefined values
  Object.keys(overrideProps).forEach(key => {
    props[key] = overrideProps[key as keyof typeof overrideProps];
  });
    
  // Cast back to partial of schema type
  const typedProps = props as Partial<TypeFromSchema<T>>;
  
  return {
    id,
    type: definition.type,
    props: typedProps
  };
}

/**
 * Component Registry storing all available component types
 */
export class ComponentRegistry {
  private components: Map<string, ComponentDefinition> = new Map();
  
  /**
   * Register a component definition
   */
  register<T extends TSchema>(definition: ComponentDefinition<T>): void {
    this.components.set(definition.type, definition);
  }
  
  /**
   * Get a component definition by type
   */
  getDefinition<T extends TSchema>(type: string): ComponentDefinition<T> | undefined {
    return this.components.get(type) as ComponentDefinition<T> | undefined;
  }
  
  /**
   * Get all registered component definitions
   */
  getAllDefinitions(): ComponentDefinition[] {
    return Array.from(this.components.values());
  }
  
  /**
   * Create a new component instance
   */
  createInstance<T extends TSchema>(
    type: string, 
    id: string,
    overrideProps: Partial<TypeFromSchema<T>> = {}
  ): ComponentInstance<T> | undefined {
    const definition = this.getDefinition<T>(type);
    if (!definition) return undefined;
    
    return createComponentInstance(definition, id, overrideProps);
  }
}

/**
 * Global registry instance
 */
export const registry = new ComponentRegistry(); 