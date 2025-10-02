// This file re-exports the ComponentRenderer
// which is used to render all component types
import { ComponentRenderer } from '@/renderers';

// Export the ComponentRenderer as the default component for all types
export const componentMap = {
  // The ComponentRenderer handles rendering all registered component types
  _default: ComponentRenderer
};

// Export ComponentRenderer as the default component
export default ComponentRenderer; 