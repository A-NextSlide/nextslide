import { Type, TSchema, TObject, TProperties, Static } from '@sinclair/typebox';
import { isOptional, isUnionType, validateTSchemaRecord } from './typebox-utils';

/**
 * Get TypeScript type from a TypeBox schema
 */
export type TypeFromSchema<T extends TSchema> = Static<T>;

/**
 * UI Control Types supported by the editor
 */
export type ControlType = 
  | 'input' 
  | 'textarea' 
  | 'slider' 
  | 'checkbox' 
  | 'dropdown' 
  | 'grouped-dropdown' 
  | 'editable-dropdown' 
  | 'colorpicker' 
  | 'gradientpicker' 
  | 'code-editor' 
  | 'custom';

/**
 * Base interface for all control properties
 */
export interface BaseControlProps {
  label?: string;
  description?: string;
  showWhen?: Record<string, string | string[]>;
}

/**
 * Input control properties
 */
export interface InputControlProps extends BaseControlProps {
  placeholder?: string;
  pattern?: string;
}

/**
 * Textarea control properties
 */
export interface TextareaControlProps extends BaseControlProps {
  rows?: number;
  placeholder?: string;
}

/**
 * Slider control properties
 */
export interface SliderControlProps extends BaseControlProps {
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Dropdown control properties
 */
export interface DropdownControlProps extends BaseControlProps {
  enumValues: string[];
}

/**
 * Grouped dropdown control properties
 */
export interface GroupedDropdownControlProps extends BaseControlProps {
  enumValues: string[];
  enumGroups: Record<string, string[]>;
}

/**
 * Editable dropdown control properties
 */
export interface EditableDropdownControlProps extends DropdownControlProps {
  allowCustomValues?: boolean;
}

/**
 * Color picker control properties
 */
export interface ColorPickerControlProps extends BaseControlProps {
  presetColors?: string[];
  allowCustomColors?: boolean;
}

/**
 * Control Props type based on control type
 */
export type ControlProps = 
  | { control: 'input'; props: InputControlProps }
  | { control: 'textarea'; props: TextareaControlProps }
  | { control: 'slider'; props: SliderControlProps }
  | { control: 'checkbox'; props: BaseControlProps }
  | { control: 'dropdown'; props: DropdownControlProps }
  | { control: 'grouped-dropdown'; props: GroupedDropdownControlProps }
  | { control: 'editable-dropdown'; props: EditableDropdownControlProps }
  | { control: 'colorpicker'; props: ColorPickerControlProps }
  | { control: 'gradientpicker'; props: BaseControlProps }
  | { control: 'code-editor'; props: BaseControlProps }
  | { control: 'custom'; props: Record<string, any> };

/**
 * Control Metadata for UI rendering
 */
export interface ControlMetadata {
  control: ControlType;
  label?: string;
  description?: string;
  controlProps?: Record<string, any>; // Structured control properties
}

/**
 * Check if the specified schema has UI control metadata
 */
export function hasUIControl(schema: TSchema): boolean {
  return schema.metadata !== undefined && 
         'control' in schema.metadata;
}

/**
 * Get control metadata from a schema
 */
export function getControlMetadata(schema: TSchema): Partial<ControlMetadata> | undefined {
  if (!schema.metadata) return undefined;
  
  const metadata = schema.metadata;
  if (!('control' in metadata)) return undefined;
  
  // Extract control type
  const controlType = metadata.control as ControlType;
  
  // Get control props from metadata
  const controlProps = metadata.controlProps || {};
  
  // Build control metadata with a clean approach
  return {
    control: controlType,
    label: schema.title as string | undefined,
    description: schema.description as string | undefined,
    controlProps
  };
}

/**
 * Create a default value based on a schema
 */
export function createDefaultValue(schema: TSchema): any {
  // Use schema default if provided
  if ('default' in schema) return schema.default;
  
  // Handle different types
  switch (schema.type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      const result = {};
      const properties = schema.properties || {};
      for (const [key, propSchema] of Object.entries(properties)) {
        result[key] = createDefaultValue(propSchema as TSchema);
      }
      return result;
    case 'array':
      return [];
    default:
      return null;
  }
}


/**
 * TypeBox extension for UI property schemas
 * Adds control metadata to TypeBox schemas
 * Only accepts primitive types or unions of primitives
 */
export function UIProperty<T extends TSchema>(
  schema: T,
  metadata: ControlMetadata
): T {
  if (isOptional(schema)) {
    throw new Error("Optional types are not supported as the schema argument wrap assignment in Type.Optional");
  }
  // Validate that schema is a primitive type or union of primitives
  if (schema.type === 'object' || schema.type === 'array' || schema.type === null || schema.type === undefined) {
    throw new Error('UIProperty only accepts primitive types (string, number, boolean, etc.) not complex objects or arrays');
  }

  if (metadata.label === undefined) {
    throw new Error('Label is required for UIProperty');
  }
  
  // Create control props based on control type
  const controlProps: Record<string, any> = {
    ...(metadata.controlProps || {})
  };

  // Handle min/max/step for number controls
  if (schema.type === 'number') {
    // Update JSON Schema properties for validation
    if (controlProps.min !== undefined) {
      schema = { ...schema, minimum: controlProps.min } as T;
    }
    
    if (controlProps.max !== undefined) {
      schema = { ...schema, maximum: controlProps.max } as T;
    }
  }
  
  // Create new schema with metadata
  const newSchema = {
    ...schema,
    _ui_type: 'UIProperty',
    title: metadata.label,
    description: metadata.description,
    metadata: {
      control: metadata.control,
      controlProps
    }
  };
  
  return newSchema as T;
}


/**
 * Factory for creating object schemas with UI control metadata
 * Can be used to create nested objects within other objects
 * Supports all UITypes
 * Can accept any TypeBox schema as a property, be careful with nested objects
 *  - Better to use UIEnum, UIRecord, UIArray, UIObject, etc. for nested objects
 * 
 * @param title - Title of the object
 * @param properties - Properties of the object (each value must be a TSchema)
 * @param description - Description of the object
 * @param metadata - Metadata for the object
 * @returns TypeBox object schema with UI metadata
 */
export function UIObject<T extends Record<string, TSchema>>(
  title: string,
  properties: T,
  description?: string,
  metadata?: Partial<ControlMetadata>
): TObject<T> {


  if (isOptional(properties)) {
    throw new Error("Optional types are not supported as the properties argument - Must be a Record<string, TSchema>>");
  }
  // Validate properties at runtime
  validateTSchemaRecord(properties as T);

  if (isUnionType(properties as T)) {
    console.log("title", title);
    console.log("properties", properties);
    throw new Error("Union types are not supported. Consider using Type.Optional of UIEnum");
  }
  if (typeof title !== 'string') {
    console.log('title', title);
    throw new Error('Title of UIObject must be a string');
  }

  const controlProps: Record<string, any> = {};
  
  // Add showWhen condition if provided
  if (metadata?.controlProps?.showWhen) {
    controlProps.showWhen = metadata.controlProps.showWhen;
  }
  
  return Type.Object(properties, {
    _ui_type: 'UIObject',
    title: title,
    description: description,
    metadata: {
      control: metadata?.control || 'none',
      controlProps
    }
  });
}

/**
 * Factory for creating array schemas with UI control metadata
 */
export function UIArray<T extends TSchema>(
  title: string,
  items: T,
  description?: string,
  metadata?: Partial<ControlMetadata>
): TSchema {
  const controlProps: Record<string, any> = {};
  
  // Add showWhen condition if provided
  if (metadata?.controlProps?.showWhen) {
    controlProps.showWhen = metadata.controlProps.showWhen;
  }
  
  return Type.Array(items, {
    _ui_type: 'UIArray',
    title: title,
    description: description,
    metadata: {
      control: metadata?.control || 'custom',
      controlProps
    }
  });
}

/**
 * Creates a TypeBox enum schema with UI control metadata
 * 
 * @param values Object containing enum values
 * @param metadata Control metadata
 * @returns TypeBox enum schema with UI metadata
 */
export function UIEnum<T extends Record<string, string | number>>(
  title: string,
  values: T,
  description?: string,
  metadata?: Partial<ControlMetadata>
): TSchema {
  // Create the base enum schema
  const enumSchema = Type.Enum(values);
  
  // Create control props
  const controlProps: Record<string, any> = {
    ...(metadata.controlProps || {})
  };
  
  // Add enum values to controlProps if not already provided
  if (!controlProps.enumValues) {
    controlProps.enumValues = Object.values(values);
  }
  
  // Create schema with metadata
  const newSchema = {
    ...enumSchema,
    _ui_type: 'UIEnum',
    title: title,
    description: description,
    metadata: {
      control: metadata.control,
      controlProps
    }
  };
  
  return newSchema;
}

/**
 * Factory for creating record schemas with UI control metadata
 * Records are objects with dynamic keys and values of a specific type
 */
export function UIRecord<T extends TSchema, V extends TSchema>(
  title: string,
  keySchema: T,
  valueSchema: V,
  description?: string,
  metadata?: Partial<ControlMetadata>
): TSchema {
  if (typeof title !== 'string') {
    console.log('title', title);
    throw new Error('Title of UIRecord must be a string');
  }

  const controlProps: Record<string, any> = {
    ...(metadata?.controlProps || {})
  };
  
  // Add showWhen condition if provided
  if (metadata?.controlProps?.showWhen) {
    controlProps.showWhen = metadata.controlProps.showWhen;
  }
  
  return Type.Record(
    keySchema,
    valueSchema,
    {
      _ui_type: 'UIRecord',
      title: title,
      description: description,
      metadata: {
        control: metadata?.control || 'custom',
        controlProps
      }
    }
  );
} 