/**
 * ReactBits Component Integration Types
 *
 * Type definitions for integrating ReactBits animated components into NextSlide
 */

import { TSchema } from '@sinclair/typebox';

/**
 * ReactBits component categories
 */
export type ReactBitsCategory =
  | 'text-animations'
  | 'animations'
  | 'backgrounds'
  | 'components'
  | 'buttons'
  | 'forms'
  | 'loaders';

/**
 * ReactBits component variant
 */
export type ReactBitsVariant = 'JS-CSS' | 'JS-TW' | 'TS-CSS' | 'TS-TW';

/**
 * ReactBits component metadata from JSON files
 */
export interface ReactBitsComponentMetadata {
  name: string;
  type: 'registry:block';
  title: string;
  description: string;
  dependencies: string[];
  files: {
    path: string;
    content: string;
    type: 'registry:component';
  }[];
}

/**
 * Internal ReactBits component definition
 */
export interface ReactBitsDefinition {
  id: string;
  name: string;
  displayName: string;
  category: ReactBitsCategory;
  variant: ReactBitsVariant;
  description: string;
  dependencies: string[];
  propsSchema: Record<string, PropDefinition>;
  defaultProps: Record<string, any>;
  component?: React.ComponentType<any>;
  sourceCode?: string;
  quality?: number; // 1-10 rating
  tags?: string[];
}

/**
 * Prop definition for ReactBits components
 */
export interface PropDefinition {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'color' | 'function';
  label: string;
  description?: string;
  default?: any;
  required?: boolean;

  // For number types
  min?: number;
  max?: number;
  step?: number;

  // For enum types
  options?: string[] | number[];

  // For object/array types
  schema?: Record<string, PropDefinition>;
  itemSchema?: PropDefinition;

  // UI hints
  control?: 'input' | 'slider' | 'checkbox' | 'dropdown' | 'colorpicker' | 'textarea' | 'code-editor';
  group?: string;
}

/**
 * ReactBits component instance on a slide
 */
export interface ReactBitsComponentInstance {
  id: string;
  type: 'ReactBits';
  props: {
    reactBitsId: string; // Reference to ReactBitsDefinition (stored in props)
    position?: { x: number; y: number };
    width?: number | string;
    height?: number | string;
    rotation?: number;
    opacity?: number;
    zIndex?: number;
    [key: string]: any; // Additional component-specific props
  };
}

/**
 * ReactBits component registry
 */
export interface ReactBitsRegistry {
  components: Map<string, ReactBitsDefinition>;
  categories: Map<ReactBitsCategory, string[]>; // category -> component IDs
  loaded: Set<string>; // IDs of components with loaded source code
}

/**
 * Component loading state
 */
export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Component fetch result
 */
export interface FetchResult {
  success: boolean;
  component?: ReactBitsDefinition;
  error?: string;
}
