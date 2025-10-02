import React from "react";
import { ComponentInstance, ComponentType } from "../types/components";
import { registry } from "../registry";

/**
 * Converts a text alignment string to a valid React CSS property
 */
export const getTextAlign = (alignment: string): React.CSSProperties["textAlign"] => {
  return alignment as "left" | "center" | "right";
};

/**
 * Returns flex styles for vertical alignment
 */
export const getVerticalAlign = (verticalAlignment: string): React.CSSProperties => {
  const flexStyles = {
    display: "flex", 
    flexDirection: "column" as const,
  };

  switch (verticalAlignment) {
    case "bottom":
      return { 
        ...flexStyles,
        justifyContent: "flex-end"
      };
    case "middle":
      return { 
        ...flexStyles,
        justifyContent: "center"
      };
    case "top":
      return { 
        ...flexStyles,
        justifyContent: "flex-start"
      };
    default:
      return { 
        ...flexStyles,
        justifyContent: "flex-start"
      };
  }
};

/**
 * Creates standard component styles for all renderers
 */
export const createComponentStyles = (
  baseStyles: React.CSSProperties
): React.CSSProperties => {
  return {
    ...baseStyles,
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    // color property (textColor) will be inherited from baseStyles
  };
};

/**
 * Type-safe function to get component props with defaults from the registry
 */
export function getComponentProps<T = Record<string, any>>(
  component: ComponentInstance,
  defaultProps?: Partial<T>
): T {
  // Get the component type definition from TypeBox registry
  const componentDef = registry.getDefinition(component.type);
  
  // Start with registry defaults
  const registryDefaults = componentDef?.defaultProps ? componentDef.defaultProps as Record<string, any> : {};
  
  // Merge with function defaults and component props
  return {
    ...registryDefaults,
    ...defaultProps,
    ...component.props
  } as T;
}

/**
 * Gets a property from a component with type safety and fallbacks
 */
export function getComponentProp<T>(
  component: ComponentInstance,
  propName: string,
  defaultValue: T
): T {
  return (component.props?.[propName] as T) ?? defaultValue;
}

/**
 * Creates a shadow style string from component properties
 */
export function createShadowStyle(props: Record<string, any>): string {
  if (!props.shadow) return 'none';
  
  const shadowColor = props.shadowColor || 'rgba(0,0,0,0.3)';
  const shadowBlur = props.shadowBlur || 10;
  const shadowOffsetX = props.shadowOffsetX || 0;
  const shadowOffsetY = props.shadowOffsetY || 4;
  const shadowSpread = props.shadowSpread || 0;
  
  return `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`;
}

/**
 * Creates border styles from component properties
 */
export function createBorderStyle(props: Record<string, any>): React.CSSProperties {
  const borderStyles: React.CSSProperties = {};
  
  if (props.borderWidth && props.borderWidth > 0) {
    borderStyles.borderWidth = props.borderWidth;
    borderStyles.borderStyle = 'solid';
    borderStyles.borderColor = props.borderColor || '#000000';
  }
  
  if (props.borderRadius && props.borderRadius > 0) {
    borderStyles.borderRadius = props.borderRadius;
  }
  
  return borderStyles;
}

/**
 * Interface for renderer functions
 */
export interface RendererProps {
  component: ComponentInstance;
  containerRef: React.RefObject<HTMLDivElement>;
  isEditing?: boolean;
  isSelected?: boolean;
  isResizing?: boolean;
  isDragging?: boolean;
  isThumbnail?: boolean;
  styles?: React.CSSProperties;
  onUpdate?: (updates: Partial<ComponentInstance>) => void;
  slideId?: string;
}

/**
 * Base renderer type
 */
export type RendererFunction = (props: RendererProps) => React.ReactNode;

/**
 * Registry of component renderers
 * Central storage for all renderer implementations
 */
export const rendererRegistry: Record<string, RendererFunction> = {};

/**
 * Register a renderer for a component type
 * This allows dynamic registration of renderers during initialization
 */
export function registerRenderer(componentType: string, renderer: RendererFunction): void {
  rendererRegistry[componentType] = renderer;
}

/**
 * Error boundary component for renderer safety
 */
export const RendererErrorBoundary = ({ 
  component, 
  children 
}: { 
  component: ComponentInstance; 
  children: React.ReactNode 
}): React.ReactElement => {
  try {
    return React.createElement(React.Fragment, null, children);
  } catch (error) {
    console.error(`Error rendering ${component.type} component:`, error);
    return React.createElement(
      'div',
      {
        style: {
          padding: '8px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          backgroundColor: '#ffebee',
          color: '#b71c1c',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box'
        }
      },
      'Error rendering component'
    );
  }
};