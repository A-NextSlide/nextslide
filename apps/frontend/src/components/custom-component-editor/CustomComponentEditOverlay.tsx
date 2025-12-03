/**
 * CustomComponentEditOverlay - Full slide-level editing for custom components
 *
 * This component provides a complete editing experience for elements inside
 * custom components, including:
 * - Element selection with pink borders (matching slide level)
 * - Drag with zero-lag CSS variables
 * - Resize with 8-direction handles
 * - Inline text editing via iframe contentEditable
 *
 * Parent component (CustomComponentRenderer) handles the UI for element selection.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { VirtualElement, Bounds } from './types';
import { CoordinateTranslator, createCoordinateTranslator } from './coordinateTranslator';
import { ElementHitArea } from './ElementHitArea';
import { ElementSelectionOverlay } from './ElementSelectionOverlay';
import { useElementDrag } from './useElementDrag';
import { useElementResize } from './useElementResize';

// Legacy DetectedElement type for backwards compatibility
export interface DetectedElement {
  id: string;
  type: 'text' | 'image' | 'container' | 'other';
  tagName: string;
  bounds: { x: number; y: number; width: number; height: number };
  content?: string;
  src?: string;
  alt?: string;
  selector?: string;
}

interface CustomComponentEditOverlayProps {
  componentId: string;
  slideId?: string;
  isEditing: boolean;
  isSelected: boolean;
  srcDoc: string;
  scale: number;
  containerWidth: number;
  containerHeight: number;
  onHtmlUpdate: (newHtml: string) => void;
  onElementSelect: (element: DetectedElement | null) => void;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
}

/**
 * Generate the enhanced edit mode script for the iframe
 * Now includes: full layout extraction, style mutation handlers, hide/show
 */
export function generateEditModeScript(componentId: string): string {
  return `
<!-- NEXTSLIDE EDIT MODE V2 -->
<style id="ns-edit-mode-styles">
  /* Hover effects - subtle blue outline */
  .ns-editable-text:hover,
  .ns-editable-image:hover,
  .ns-editable-container:hover {
    outline: 2px solid rgba(0, 123, 255, 0.3) !important;
    outline-offset: 2px !important;
  }

  /* Selected state - handled by overlay now, keep subtle */
  .ns-editable-text.ns-selected,
  .ns-editable-image.ns-selected,
  .ns-editable-container.ns-selected {
    outline: none !important;
  }

  /* Hidden state for overlay editing */
  .ns-hidden-for-edit {
    visibility: hidden !important;
  }

  /* Image loading shimmer */
  .ns-image-loading {
    position: relative !important;
    background: linear-gradient(135deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%) !important;
    background-size: 200% 200% !important;
    animation: ns-shimmer 1.5s ease-in-out infinite !important;
  }
  @keyframes ns-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* Disable pointer events in edit mode - overlay handles interactions */
  body.ns-overlay-mode * {
    pointer-events: none !important;
  }
  body.ns-overlay-mode {
    pointer-events: auto !important;
  }
</style>
<script>
(function() {
  const COMPONENT_ID = '${componentId}';
  let overlayMode = false;

  // Detect positioning strategy
  function detectPositioningStrategy(el, style) {
    if (style.position === 'absolute' || style.position === 'fixed') return 'absolute';
    if (el.parentElement) {
      const parentStyle = getComputedStyle(el.parentElement);
      if (parentStyle.display === 'flex') return 'flex-item';
      if (parentStyle.display === 'grid') return 'grid-item';
    }
    if (style.position === 'relative') return 'relative';
    return 'static';
  }

  // Extract full element layout
  function extractElementLayout(el, type) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const strategy = detectPositioningStrategy(el, style);

    return {
      id: el.dataset.nsId,
      type: type,
      tagName: el.tagName.toLowerCase(),
      iframeBounds: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      bounds: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      },
      positioningStrategy: strategy,
      computedStyle: {
        position: style.position,
        top: style.top,
        left: style.left,
        right: style.right,
        bottom: style.bottom,
        width: style.width,
        height: style.height,
        transform: style.transform,
        margin: style.margin,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        color: style.color,
        textAlign: style.textAlign,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing
      },
      textContent: el.textContent?.trim().slice(0, 500),
      htmlContent: el.innerHTML,
      src: el.src,
      alt: el.alt,
      selector: '[data-ns-id="' + el.dataset.nsId + '"]',
      // All elements can be dragged - styleMutator handles positioning strategy appropriately
      // For flex/grid items, only resize will take effect (position determined by layout)
      isDraggable: true,
      isResizable: true
    };
  }

  // Mark elements as editable
  let setupRan = false;
  function setupEditableElements() {
    if (setupRan) return;
    setupRan = true;

    // Text elements
    const textSelectors = 'h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button';
    document.querySelectorAll(textSelectors).forEach((el, index) => {
      if (el.dataset.nsId) return;
      const directText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent || '')
        .join('')
        .trim();
      if (directText && directText.length > 1) {
        el.dataset.nsId = 'text-' + index;
        el.classList.add('ns-editable-text');
      }
    });

    // Image elements
    document.querySelectorAll('img').forEach((img, index) => {
      if (img.dataset.nsId) return;
      if (img.width < 30 || img.height < 30) return;
      img.dataset.nsId = 'img-' + index;
      img.classList.add('ns-editable-image');
    });

    // Container elements
    const containerSelectors = 'section, article, header, footer, main, aside, nav, div[class], div[id], ul, ol, figure, blockquote, [class*="card"], [class*="section"], [class*="container"]';
    let containerIndex = 0;
    document.querySelectorAll(containerSelectors).forEach((el) => {
      if (el.dataset.nsId) return;
      if (el.classList.contains('ns-editable-text')) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 40) return;
      if (rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95) return;
      el.dataset.nsId = 'container-' + containerIndex++;
      el.classList.add('ns-editable-container');
    });
  }

  // Extract all elements
  function extractAllElements() {
    const elements = [];

    document.querySelectorAll('.ns-editable-text').forEach(el => {
      elements.push(extractElementLayout(el, 'text'));
    });

    document.querySelectorAll('.ns-editable-image').forEach(el => {
      elements.push(extractElementLayout(el, 'image'));
    });

    document.querySelectorAll('.ns-editable-container').forEach(el => {
      if (!el.classList.contains('ns-editable-text') && !el.classList.contains('ns-editable-image')) {
        elements.push(extractElementLayout(el, 'container'));
      }
    });

    return elements;
  }

  // Send message to parent
  function sendToParent(type, data) {
    window.parent.postMessage({
      source: 'ns-custom-component-edit',
      componentId: COMPONENT_ID,
      type: type,
      ...data
    }, '*');
  }

  // Listen for messages from parent
  window.addEventListener('message', function(e) {
    if (e.data?.target !== 'ns-custom-component-edit') return;

    // Extract all elements request
    if (e.data.type === 'extract-elements') {
      const elements = extractAllElements();
      sendToParent('elements-extracted', { elements: elements });
    }

    // Apply style mutation
    if (e.data.type === 'apply-style-mutation') {
      const el = document.querySelector(e.data.selector);
      if (el && e.data.styles) {
        Object.keys(e.data.styles).forEach(key => {
          el.style[key] = e.data.styles[key];
        });
      }
    }

    // Hide element for overlay editing
    if (e.data.type === 'hide-element') {
      const el = document.querySelector(e.data.selector);
      if (el) {
        el.classList.add('ns-hidden-for-edit');
      }
    }

    // Show element after overlay editing
    if (e.data.type === 'show-element') {
      const el = document.querySelector(e.data.selector);
      if (el) {
        el.classList.remove('ns-hidden-for-edit');
      }
    }

    // Update element HTML content
    if (e.data.type === 'update-element-html') {
      const el = document.querySelector(e.data.selector);
      if (el && e.data.html) {
        el.innerHTML = e.data.html;
      }
    }

    // Update element text content
    if (e.data.type === 'update-text') {
      const el = document.querySelector('[data-ns-id="' + e.data.elementId + '"]');
      if (el) {
        el.textContent = e.data.newText;
      }
    }

    // Update image
    if (e.data.type === 'update-image') {
      const img = document.querySelector('img[data-ns-id="' + e.data.elementId + '"]');
      if (img) {
        img.src = e.data.newSrc;
        sendToParent('image-updated', { elementId: e.data.elementId, newSrc: e.data.newSrc });
      }
    }

    // Update image with loading state
    if (e.data.type === 'update-image-with-placeholder') {
      const img = document.querySelector('img[data-ns-id="' + e.data.elementId + '"]');
      if (img) {
        img.classList.add('ns-image-loading');
        img.src = e.data.newSrc;
        img.onload = function() {
          img.classList.remove('ns-image-loading');
          sendToParent('image-loaded', { elementId: e.data.elementId, newSrc: e.data.newSrc });
        };
        img.onerror = function() {
          img.classList.remove('ns-image-loading');
        };
      }
    }

    // Start text editing with contentEditable
    if (e.data.type === 'start-text-edit') {
      const el = document.querySelector(e.data.selector);
      if (el) {
        el.contentEditable = 'true';
        el.focus();
        el.classList.add('ns-editing-text');

        // Select all text
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);

        // Handle blur to end editing
        const handleBlur = function() {
          el.contentEditable = 'false';
          el.classList.remove('ns-editing-text');
          el.removeEventListener('blur', handleBlur);

          // Notify parent of text change
          sendToParent('text-changed', {
            elementId: el.dataset.nsId,
            selector: e.data.selector,
            newText: el.textContent,
            newHtml: el.innerHTML
          });
        };
        el.addEventListener('blur', handleBlur);

        // Handle Enter to end editing (but Shift+Enter for newline)
        el.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            el.blur();
          }
          if (ev.key === 'Escape') {
            ev.preventDefault();
            el.blur();
          }
        });
      }
    }

    // Enable/disable overlay mode
    if (e.data.type === 'set-overlay-mode') {
      overlayMode = e.data.enabled;
      if (overlayMode) {
        document.body.classList.add('ns-overlay-mode');
      } else {
        document.body.classList.remove('ns-overlay-mode');
      }
    }

    // Deselect all
    if (e.data.type === 'deselect') {
      document.querySelectorAll('.ns-selected').forEach(el => {
        el.classList.remove('ns-selected');
      });
    }
  });

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupEditableElements();
      sendToParent('edit-mode-ready', {});
    });
  } else {
    setupEditableElements();
    sendToParent('edit-mode-ready', {});
  }
})();
</script>`;
}

/**
 * Inject edit mode into HTML
 */
export function injectEditMode(html: string, componentId: string): string {
  if (!html) return html;

  const editScript = generateEditModeScript(componentId);

  if (html.includes('</body>')) {
    return html.replace('</body>', editScript + '</body>');
  } else if (html.includes('</html>')) {
    return html.replace('</html>', editScript + '</html>');
  } else {
    return html + editScript;
  }
}

/**
 * Convert VirtualElement to DetectedElement for backwards compatibility
 */
function toDetectedElement(ve: VirtualElement): DetectedElement {
  return {
    id: ve.id,
    type: ve.type === 'icon' || ve.type === 'shape' ? 'other' : ve.type,
    tagName: ve.tagName,
    bounds: ve.bounds,
    content: ve.textContent,
    src: ve.src,
    alt: ve.alt,
    selector: ve.selector,
  };
}

/**
 * Inner component that uses the drag/resize hooks
 */
const ElementInteractionLayer: React.FC<{
  element: VirtualElement;
  coordinator: CoordinateTranslator;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onPositionChange: (bounds: Bounds, styles: Record<string, string>) => void;
  onDragEnd: (bounds: Bounds, styles: Record<string, string>) => void;
  onResizeChange: (bounds: Bounds, styles: Record<string, string>) => void;
  onResizeEnd: (bounds: Bounds, styles: Record<string, string>) => void;
  onDoubleClick: () => void;
}> = ({ element, coordinator, iframeRef, onPositionChange, onDragEnd, onResizeChange, onResizeEnd, onDoubleClick }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  const { isDragging, dragOffset, handleDragStart } = useElementDrag({
    element,
    coordinator,
    iframeRef,
    overlayRef,
    onPositionChange,
    onDragEnd,
  });

  const { isResizing, resizeDirection, handleResizeStart } = useElementResize({
    element,
    coordinator,
    iframeRef,
    onSizeChange: onResizeChange,
    onResizeEnd,
  });

  return (
    <ElementSelectionOverlay
      element={element}
      coordinator={coordinator}
      isDragging={isDragging}
      isResizing={isResizing}
      dragOffset={dragOffset}
      onDragStart={handleDragStart}
      onResizeStart={handleResizeStart}
      onDoubleClick={onDoubleClick}
      overlayRef={overlayRef}
    />
  );
};

/**
 * CustomComponentEditOverlay - Main component
 */
export const CustomComponentEditOverlay: React.FC<CustomComponentEditOverlayProps> = ({
  componentId,
  slideId,
  isEditing,
  isSelected,
  srcDoc,
  scale,
  containerWidth,
  containerHeight,
  onHtmlUpdate,
  onElementSelect,
  iframeRef: externalIframeRef,
}) => {
  // State
  const [virtualElements, setVirtualElements] = useState<VirtualElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Refs
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef || internalIframeRef;
  const coordinatorRef = useRef<CoordinateTranslator | null>(null);

  // Selected element
  const selectedElement = useMemo(
    () => virtualElements.find(e => e.id === selectedElementId) || null,
    [virtualElements, selectedElementId]
  );

  // Initialize/update coordinator
  useEffect(() => {
    if (iframeRef.current && containerWidth > 0) {
      coordinatorRef.current = createCoordinateTranslator(
        iframeRef.current,
        containerWidth,
        containerHeight
      );
    }
  }, [iframeRef, containerWidth, containerHeight, scale]);

  // Request elements from iframe when ready
  const requestElements = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'extract-elements',
      }, '*');
    }
  }, [iframeRef]);

  // Listen for messages from iframe
  useEffect(() => {
    if (!isEditing || !isSelected) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.source !== 'ns-custom-component-edit') return;
      if (data?.componentId !== componentId) return;

      if (data.type === 'edit-mode-ready') {
        setIsReady(true);
        // Request element extraction
        setTimeout(requestElements, 100);
      }

      if (data.type === 'elements-extracted' && data.elements) {
        // Update coordinator
        if (iframeRef.current) {
          coordinatorRef.current?.update(iframeRef.current);
        }

        // Convert iframe bounds to parent viewport bounds
        const elements: VirtualElement[] = data.elements.map((el: any) => ({
          ...el,
          bounds: coordinatorRef.current
            ? coordinatorRef.current.iframeToParent(el.iframeBounds)
            : el.iframeBounds,
        }));

        setVirtualElements(elements);
      }

      // Legacy image-selected handler for ImageElementToolbar
      if (data.type === 'image-selected') {
        const el = virtualElements.find(e => e.id === data.element?.id);
        if (el) {
          setSelectedElementId(el.id);
          onElementSelect(toDetectedElement(el));
        }
      }

      // Handle text editing finished - re-enable hit areas
      if (data.type === 'text-changed') {
        setEditingTextId(null);
        // Request fresh element data after text edit
        setTimeout(requestElements, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEditing, isSelected, componentId, iframeRef, requestElements, virtualElements, onElementSelect]);

  // Re-extract elements when srcDoc changes
  useEffect(() => {
    if (isReady && isEditing && isSelected) {
      const timeoutId = setTimeout(requestElements, 200);
      return () => clearTimeout(timeoutId);
    }
  }, [srcDoc, isReady, isEditing, isSelected, requestElements]);

  // Handle element selection
  const handleSelectElement = useCallback((elementId: string) => {
    setSelectedElementId(elementId);
    setEditingTextId(null);

    // Notify parent of selection change
    const element = virtualElements.find(e => e.id === elementId);
    if (element) {
      onElementSelect(toDetectedElement(element));
    }

    // Notify iframe
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'deselect',
      }, '*');
    }
  }, [iframeRef, virtualElements, onElementSelect]);

  // Handle double-click for text editing
  const handleDoubleClick = useCallback((element: VirtualElement) => {
    if (element.type === 'text') {
      // Use iframe's contentEditable for inline text editing (like before)
      // Send message to iframe to make element editable
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'start-text-edit',
          selector: element.selector,
        }, '*');
      }
      // Clear overlay selection and set editing state so hit areas are disabled
      setSelectedElementId(null);
      setEditingTextId(element.id); // Disable hit areas during editing
      onElementSelect(null);
    } else if (element.type === 'image') {
      onElementSelect(toDetectedElement(element));
    }
  }, [iframeRef, onElementSelect]);

  // Handle position change (during drag)
  const handlePositionChange = useCallback((newBounds: Bounds, styles: Record<string, string>) => {
    if (!selectedElement) return;

    // Apply styles to iframe element
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector: selectedElement.selector,
        styles,
      }, '*');
    }
  }, [selectedElement, iframeRef]);

  // Handle drag end
  const handleDragEnd = useCallback((newBounds: Bounds, styles: Record<string, string>) => {
    if (!selectedElement) return;

    // Update virtual element bounds
    setVirtualElements(prev => prev.map(e =>
      e.id === selectedElement.id
        ? {
            ...e,
            iframeBounds: newBounds,
            bounds: coordinatorRef.current?.iframeToParent(newBounds) || newBounds,
          }
        : e
    ));

    // Request fresh element data
    setTimeout(requestElements, 100);
  }, [selectedElement, requestElements]);

  // Handle resize change
  const handleResizeChange = useCallback((newBounds: Bounds, styles: Record<string, string>) => {
    if (!selectedElement) return;

    // Apply styles to iframe element
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector: selectedElement.selector,
        styles,
      }, '*');
    }
  }, [selectedElement, iframeRef]);

  // Handle resize end
  const handleResizeEnd = useCallback((newBounds: Bounds, styles: Record<string, string>) => {
    if (!selectedElement) return;

    // Update virtual element bounds
    setVirtualElements(prev => prev.map(e =>
      e.id === selectedElement.id
        ? {
            ...e,
            iframeBounds: newBounds,
            bounds: coordinatorRef.current?.iframeToParent(newBounds) || newBounds,
          }
        : e
    ));

    // Request fresh element data
    setTimeout(requestElements, 100);
  }, [selectedElement, requestElements]);

  // Handle text edit finish
  const handleTextEditFinish = useCallback((newHtml: string, newText: string) => {
    if (!editingTextId) return;

    const element = virtualElements.find(e => e.id === editingTextId);
    if (!element) return;

    // Update iframe element
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'update-element-html',
        selector: element.selector,
        html: newHtml,
      }, '*');
    }

    setEditingTextId(null);

    // Request fresh element data
    setTimeout(requestElements, 100);
  }, [editingTextId, virtualElements, iframeRef, requestElements]);

  // Handle text edit cancel
  const handleTextEditCancel = useCallback(() => {
    setEditingTextId(null);
  }, []);

  // Handle deselect
  const handleDeselect = useCallback(() => {
    setSelectedElementId(null);
    setEditingTextId(null);

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'deselect',
      }, '*');
    }
  }, [iframeRef]);

  // Don't render if not in edit mode
  if (!isEditing || !isSelected) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 100 }}>
      {/* Element hit areas for click detection */}
      {virtualElements.map(element => (
        <ElementHitArea
          key={element.id}
          element={element}
          isSelected={element.id === selectedElementId}
          onSelect={() => handleSelectElement(element.id)}
          onDoubleClick={() => handleDoubleClick(element)}
          disabled={!!editingTextId}
        />
      ))}

      {/* Selection overlay with handles */}
      {selectedElement && coordinatorRef.current && (
        <ElementInteractionLayer
          element={selectedElement}
          coordinator={coordinatorRef.current}
          iframeRef={iframeRef as React.RefObject<HTMLIFrameElement>}
          onPositionChange={handlePositionChange}
          onDragEnd={handleDragEnd}
          onResizeChange={handleResizeChange}
          onResizeEnd={handleResizeEnd}
          onDoubleClick={() => handleDoubleClick(selectedElement)}
        />
      )}

      {/* Note: Floating chat panel removed - parent component (CustomComponentRenderer)
          handles the UI for text/image/container selection via its own state and components:
          - Text: Small floating AI button with chat popup
          - Image: ImageElementToolbar
          - Container: ChatPanel style editor

          Text editing is now handled inline via iframe contentEditable (start-text-edit message)
      */}
    </div>,
    document.body
  );
};

export default CustomComponentEditOverlay;
