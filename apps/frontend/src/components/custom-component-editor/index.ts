// Main overlay component and types
export {
  CustomComponentEditOverlay,
  type DetectedElement,
  injectEditMode,
  generateEditModeScript,
} from './CustomComponentEditOverlay';

// Image toolbar (existing)
export { ImageElementToolbar } from './ImageElementToolbar';

// Types
export type {
  VirtualElement,
  Bounds,
  PositioningStrategy,
  ResizeDirection,
  ElementLayoutUpdate,
  IframeMessage,
  ParentMessage,
} from './types';

// Coordinate translation
export {
  CoordinateTranslator,
  createCoordinateTranslator,
} from './coordinateTranslator';

// Element interaction components
export { ElementHitArea } from './ElementHitArea';
export { ElementSelectionOverlay } from './ElementSelectionOverlay';
export { PortaledTiptapEditor } from './PortaledTiptapEditor';

// Hooks
export { useElementDrag } from './useElementDrag';
export { useElementResize } from './useElementResize';

// Style mutation utilities
export {
  generateStyleMutation,
  generateResizeStyles,
  generateMoveStyles,
  stylesToString,
  mergeInlineStyles,
  applyStyleMutationToHtml,
  canElementBeDragged,
  canElementBeResized,
} from './styleMutator';
