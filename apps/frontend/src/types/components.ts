import { ControlMetadata } from "../registry/schemas";
import { BaseComponentProps } from "../registry/base";

/**
 * Enhanced ComponentType with renderer and editor information
 * This creates a complete registration of component capabilities
 */
export type ComponentType = {
  /** Unique identifier for this component type */
  type: string;
  
  /** Human-readable display name */
  name: string;
  
  /** Component-specific editor schema for properties */
  editorSchema: Record<string, ControlMetadata>;
  
  /** Default property values */
  defaultProps?: Partial<BaseComponentProps> & Record<string, any>;
  
  /** 
   * Optional reference to the renderer function name 
   * When not specified, falls back to the type name for standard mapping
   */
  renderer?: string;
  
  /** 
   * Optional reference to the settings editor component 
   * When not specified, falls back to standard property editors
   */
  editorComponent?: string;
  
  /**
   * Category for grouping components in the editor UI
   * Useful for organization in the component palette
   */
  category?: 'basic' | 'media' | 'data' | 'advanced' | 'layout';
};

export interface ComponentOptions {
  [key: string]: unknown;
}

export type ComponentRegistry = Record<string, ComponentType>;

/**
 * ComponentInstance represents an actual component on a slide
 */
export type ComponentInstance = {
  /** Unique ID for this specific instance */
  id: string;
  
  /** The component type identifier */
  type: string;
  
  /** Properties for this instance (combination of global + component-specific) */
  props: Partial<BaseComponentProps> & Record<string, any>;
  
  /** Read-only properties that are computed/derived, not directly editable */
  readonly state?: {
    isSelected?: boolean;
    isHovered?: boolean;
    isDragging?: boolean;
    isResizing?: boolean;
  };
  
  /** Interactive state */
  isCustomComponent?: boolean;
  isInteractive?: boolean;
  disableAutoSelect?: boolean;
  isEditingDisabled?: boolean;
  slideId?: string;
}; 