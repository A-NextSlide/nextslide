// Import and re-export from utils
import { 
  rendererRegistry, 
  registerRenderer,
  createComponentStyles,
  getComponentProps,
  getComponentProp,
  createShadowStyle,
  createBorderStyle,
  getTextAlign,
  getVerticalAlign,
  RendererErrorBoundary
} from './utils';

// Define the interfaces/types here as well to avoid export issues
import { ComponentInstance } from "../types/components";
import React from "react";

// Import ComponentRenderer
import { ComponentRenderer } from './ComponentRenderer';

// Re-export the utility functions
export {
  // Registry
  rendererRegistry,
  
  // Registration function
  registerRenderer,
  
  // Component styling utilities
  createComponentStyles,
  getComponentProps,
  getComponentProp,
  createShadowStyle,
  createBorderStyle,
  getTextAlign,
  getVerticalAlign,
  
  // Safety components
  RendererErrorBoundary,
  
  // Export ComponentRenderer
  ComponentRenderer
};

// Define and export the interfaces
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

export type RendererFunction = (props: RendererProps) => React.ReactNode;

// Export component renderers
export { ChartRenderer } from './components/ChartRenderer';
export { TiptapTextBlockRenderer } from './components/TiptapTextBlockRenderer';

// Initialize all renderers (this ensures the register calls are executed)
// These imports ensure that each renderer registers itself
import './components/BackgroundRenderer';
import './components/ShapeRenderer';
import './components/ShapeWithTextRenderer';
import './components/TiptapTextBlockRenderer';
import './components/ImageRenderer';
import './components/VideoRenderer';
import './components/TableRenderer';
import './components/CustomComponentRenderer';
import './components/LinesRenderer';
import './components/GroupRenderer';
import './components/IconRenderer';
import './components/WavyLinesRenderer';

// Auto-register chart renderers from the new charts system
import '@/charts/renderers/BaseChartRenderer'; 

// Legacy exports for backward compatibility
export * from './components';