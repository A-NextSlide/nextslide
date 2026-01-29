/**
 * Types for the Custom Component Editor overlay system
 *
 * This module defines the data structures used to represent elements
 * inside custom components for editing purposes.
 */

/**
 * Bounds represent a rectangle in a coordinate space
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * CSS positioning strategy determines how an element can be moved
 */
export type PositioningStrategy =
  | 'absolute'    // Can move freely via top/left
  | 'relative'    // Move via transform
  | 'flex-item'   // Resize only, movement changes order
  | 'grid-item'   // Resize only, movement changes grid placement
  | 'static';     // Will convert to relative for movement

/**
 * Virtual Element represents an editable element inside a custom component
 * Contains both iframe-local and parent viewport coordinates
 */
export interface VirtualElement {
  /** Unique identifier from data-ns-id attribute */
  id: string;

  /** Element type for UI purposes */
  type: 'text' | 'image' | 'container' | 'shape' | 'icon';

  /** Optional label derived from alt/title/aria/id/class/src */
  label?: string;

  /** Original HTML tag name */
  tagName: string;

  /**
   * Iframe-local coordinates (relative to iframe viewport)
   * These are the "source of truth" for element position
   */
  iframeBounds: Bounds;

  /**
   * Parent viewport coordinates (computed from iframeBounds)
   * Used for positioning overlay UI
   */
  bounds: Bounds;

  /** How the element is positioned in CSS */
  positioningStrategy: PositioningStrategy;

  /** Parent element id (for layers tree) */
  parentId?: string | null;

  /** DOM order index captured during extraction */
  domIndex?: number;

  /** Computed z-index for layering */
  zIndex?: number;

  /** Current computed CSS properties */
  computedStyle: {
    position: string;
    top: string;
    left: string;
    right: string;
    bottom: string;
    width: string;
    height: string;
    transform: string;
    margin: string;
    padding?: string;
    fontSize?: string;
    fontFamily?: string;
    fontWeight?: string;
    color?: string;
    textAlign?: string;
    lineHeight?: string;
    letterSpacing?: string;
    backgroundColor?: string;
    borderRadius?: string;
    borderColor?: string;
    borderWidth?: string;
    borderStyle?: string;
    zIndex?: string;
  };

  /** Text content (for text elements) */
  textContent?: string;

  /** Inner HTML content (for text elements with formatting) */
  htmlContent?: string;

  /** Image source (for image elements) */
  src?: string;

  /** Image alt text */
  alt?: string;

  /** CSS selector to find this element in the iframe */
  selector: string;

  /** Whether this element can be dragged */
  isDraggable: boolean;

  /** Whether this element can be resized */
  isResizable: boolean;

  /** True if this image is from a JS array (tabs/carousel), not DOM */
  isJsArrayImage?: boolean;

  /** True if this element is semantically interactive (button, link, has onclick, etc.) */
  isInteractive?: boolean;
}

/**
 * Represents a pending layout update to an element
 */
export interface ElementLayoutUpdate {
  elementId: string;
  selector: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  styles?: Record<string, string>;
}

/**
 * Message types sent from iframe to parent
 */
export type IframeToParentMessageType =
  | 'edit-mode-ready'
  | 'element-selected'
  | 'text-selected'
  | 'image-selected'
  | 'container-selected'
  | 'element-deselected'
  | 'text-changed'
  | 'image-updated'
  | 'image-loaded'
  | 'component-clicked'
  | 'elements-extracted';

/**
 * Message types sent from parent to iframe
 */
export type ParentToIframeMessageType =
  | 'extract-elements'
  | 'apply-style-mutation'
  | 'update-element-html'
  | 'update-image'
  | 'update-image-with-placeholder'
  | 'update-text'
  | 'hide-element'
  | 'show-element'
  | 'deselect'
  | 'reparent-element'
  | 'trigger-element-select';

/**
 * Message from iframe to parent
 */
export interface IframeMessage {
  source: 'ns-custom-component-edit';
  componentId: string;
  type: IframeToParentMessageType;
  element?: Partial<VirtualElement>;
  elements?: Partial<VirtualElement>[];
  elementId?: string;
  oldText?: string;
  newText?: string;
  newSrc?: string;
}

/**
 * Message from parent to iframe
 */
export interface ParentMessage {
  target: 'ns-custom-component-edit';
  type: ParentToIframeMessageType;
  selector?: string;
  elementId?: string;
  parentId?: string | null;
  styles?: Record<string, string>;
  html?: string;
  newText?: string;
  newSrc?: string;
  x?: number;
  y?: number;
}

/**
 * Resize direction for handles
 */
export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Drag state for element dragging
 */
export interface ElementDragState {
  isDragging: boolean;
  startMouseX: number;
  startMouseY: number;
  startBounds: Bounds;
  currentOffset: { x: number; y: number };
}

/**
 * Resize state for element resizing
 */
export interface ElementResizeState {
  isResizing: boolean;
  direction: ResizeDirection;
  startMouseX: number;
  startMouseY: number;
  startBounds: Bounds;
}
