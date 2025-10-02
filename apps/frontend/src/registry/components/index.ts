import { registry } from '../registry';

// Import all component definitions
import { ChartDefinition } from './chart';
import { BackgroundDefinition } from './background';
import { ShapeDefinition } from './shape';
import { TableDefinition } from './table';
import { CustomComponentDefinition } from './custom-component';
import { ImageDefinition } from './image';
import { VideoDefinition } from './video';
import { TiptapTextBlockDefinition } from './tiptap-text-block';
import { LinesDefinition } from './lines';
import { GroupDefinition } from './group';
import { IconDefinition } from './icon';

// Export all component definitions
export { ChartDefinition } from './chart';
export { BackgroundDefinition } from './background';
export { ShapeDefinition } from './shape';
export { TableDefinition } from './table';
export { CustomComponentDefinition } from './custom-component';
export { ImageDefinition } from './image';
export { VideoDefinition } from './video';
export { TiptapTextBlockDefinition } from './tiptap-text-block';
export { LinesDefinition } from './lines';
export { GroupDefinition } from './group';
export { IconDefinition } from './icon';

// Register all components with the registry
export function registerComponents() {
  registry.register(ChartDefinition);
  registry.register(BackgroundDefinition);
  registry.register(ShapeDefinition);
  registry.register(TableDefinition);
  registry.register(CustomComponentDefinition);
  registry.register(ImageDefinition);
  registry.register(VideoDefinition);
  registry.register(TiptapTextBlockDefinition);
  registry.register(LinesDefinition);
  // Alias registrations for Lines component to support 'Line' and 'line' types
  // These aliases use the same schema and defaults as Lines
  registry.register({ ...(LinesDefinition as any), type: 'Line', name: 'Line' } as any);
  registry.register({ ...(LinesDefinition as any), type: 'line', name: 'line' } as any);
  // Alias registration for ShapeWithText -> reuse Shape schema/defaults
  registry.register({ ...(ShapeDefinition as any), type: 'ShapeWithText', name: 'Shape With Text' } as any);
  registry.register(GroupDefinition);
  registry.register(IconDefinition);
}

// Auto-register components when this module is imported
registerComponents();