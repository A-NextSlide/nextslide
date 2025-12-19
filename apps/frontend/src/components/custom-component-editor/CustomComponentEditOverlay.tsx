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
import { useCustomComponentEditStore } from '@/stores/customComponentEditStore';

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
  onElementSelect: (element: DetectedElement | null, cursorX?: number, cursorY?: number) => void;
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

  function extractBackgroundImage(style) {
    const bg = style.backgroundImage || '';
    if (!bg || bg === 'none') return '';
    const match = bg.match(/url\\(["']?([^"')]+)["']?\\)/i);
    return match ? match[1] : '';
  }

  function getParentNsId(el) {
    let current = el.parentElement;
    while (current) {
      if (current.dataset && current.dataset.nsId) {
        return current.dataset.nsId;
      }
      current = current.parentElement;
    }
    return null;
  }

  function normalizeLabel(value) {
    return (value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function isGenericLabel(value) {
    if (!value) return true;
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalized) return true;
    return (
      normalized === 'image' ||
      normalized === 'img' ||
      normalized === 'photo' ||
      normalized === 'picture' ||
      normalized === 'graphic' ||
      normalized === 'icon' ||
      normalized === 'logo' ||
      normalized === 'figure' ||
      normalized === 'background' ||
      /^image\\s*\\d+$/.test(normalized) ||
      /^img\\s*\\d+$/.test(normalized)
    );
  }

  function extractFilename(url) {
    if (!url) return '';
    try {
      const cleaned = url.split('?')[0].split('#')[0];
      const parts = cleaned.split('/');
      const last = parts[parts.length - 1] || '';
      return decodeURIComponent(last).replace(/\\.[a-z0-9]+$/i, '');
    } catch (e) {
      return '';
    }
  }

  function deriveLabel(el, type, style, src) {
    const candidates = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('alt'),
      el.getAttribute('data-name'),
      el.getAttribute('data-label'),
      el.getAttribute('data-title'),
      el.id
    ];

    const className = el.getAttribute('class') || '';
    const classParts = className
      .split(/\\s+/)
      .map(function(part) { return part.trim(); })
      .filter(function(part) { return part && !part.startsWith('ns-'); });
    if (classParts.length > 0) {
      candidates.push(classParts[0]);
    }

    for (let i = 0; i < candidates.length; i++) {
      const label = normalizeLabel(candidates[i]);
      if (label && !isGenericLabel(label)) {
        return label;
      }
    }

    if (type === 'image') {
      const filename = extractFilename(src);
      if (filename) return filename;
    }

    if (type === 'text') {
      const text = (el.textContent || '').trim();
      if (text) {
        return text.length > 40 ? text.slice(0, 40) + '...' : text;
      }
    }

    if (type === 'container') {
      return 'Container';
    }

    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  // Extract full element layout
  function extractElementLayout(el, type, domIndex) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const strategy = detectPositioningStrategy(el, style);
    const backgroundImage = extractBackgroundImage(style);
    const src = el.tagName.toLowerCase() === 'img' ? el.src : backgroundImage;

    return {
      id: el.dataset.nsId,
      type: type,
      label: deriveLabel(el, type, style, src),
      tagName: el.tagName.toLowerCase(),
      parentId: getParentNsId(el),
      domIndex: domIndex,
      zIndex: parseInt(style.zIndex || '0', 10) || 0,
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
        padding: style.padding,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        color: style.color,
        textAlign: style.textAlign,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        borderStyle: style.borderStyle,
        zIndex: style.zIndex
      },
      textContent: el.textContent?.trim().slice(0, 500),
      htmlContent: el.innerHTML,
      src: src,
      alt: el.alt || el.getAttribute('aria-label') || el.getAttribute('title') || '',
      selector: '[data-ns-id="' + el.dataset.nsId + '"]',
      // All elements can be dragged - styleMutator handles positioning strategy appropriately
      // For flex/grid items, only resize will take effect (position determined by layout)
      isDraggable: true,
      isResizable: true
    };
  }

  // Mark elements as editable - comprehensive detection
  let setupRan = false;
  function setupEditableElements() {
    if (setupRan) return;
    setupRan = true;

    let textIndex = 0;
    let containerIndex = 0;

    // Text elements - more comprehensive detection
    const textSelectors = 'h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button, figcaption, blockquote, cite, em, strong, b, i, u, sub, sup, small, mark, del, ins, q';
    document.querySelectorAll(textSelectors).forEach((el) => {
      if (el.dataset.nsId) return;
      // Check for any text content (direct or nested)
      const text = el.textContent?.trim() || '';
      if (text.length > 0) {
        // Skip if parent already has this text (avoid duplicates)
        const parentText = el.parentElement?.textContent?.trim() || '';
        const isOnlyTextChild = el.parentElement &&
          el.parentElement.childElementCount === 1 &&
          parentText === text;
        if (isOnlyTextChild && el.parentElement.dataset.nsId) return;

        el.dataset.nsId = 'text-' + textIndex++;
        el.classList.add('ns-editable-text');
      }
    });

    // Image elements - include SVGs and background images
    document.querySelectorAll('img, svg, [style*="background-image"]').forEach((el, index) => {
      if (el.dataset.nsId) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;
      el.dataset.nsId = 'img-' + index;
      el.classList.add('ns-editable-image');
    });

    // Container/Box elements - much more comprehensive
    // ANY div, section, or styled element that isn't already marked
    document.querySelectorAll('div, section, article, header, footer, main, aside, nav, ul, ol, figure, form, fieldset, table, tbody, thead, tr').forEach((el) => {
      if (el.dataset.nsId) return;
      if (el.classList.contains('ns-editable-text')) return;
      if (el.classList.contains('ns-editable-image')) return;

      const rect = el.getBoundingClientRect();
      // Lower minimum size - 30x30 to catch more boxes
      if (rect.width < 30 || rect.height < 30) return;
      // Skip if it's basically the whole page
      if (rect.width >= window.innerWidth * 0.98 && rect.height >= window.innerHeight * 0.98) return;

      // Check if element has visual styling (background, border, etc.)
      const style = getComputedStyle(el);
      const hasVisualStyling =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        style.backgroundImage !== 'none' ||
        style.borderWidth !== '0px' ||
        style.boxShadow !== 'none' ||
        style.borderRadius !== '0px' ||
        el.className.length > 0;

      // Mark it if it has styling OR is reasonably sized
      if (hasVisualStyling || (rect.width >= 50 && rect.height >= 50)) {
        el.dataset.nsId = 'container-' + containerIndex++;
        el.classList.add('ns-editable-container');
      }
    });
  }

  // Extract all elements
  function extractAllElements() {
    const elements = [];

    const allEditable = Array.from(document.querySelectorAll('[data-ns-id]'));
    allEditable.forEach(function(el, index) {
      if (el.classList.contains('ns-editable-text')) {
        elements.push(extractElementLayout(el, 'text', index));
        return;
      }
      if (el.classList.contains('ns-editable-image')) {
        elements.push(extractElementLayout(el, 'image', index));
        return;
      }
      if (el.classList.contains('ns-editable-container')) {
        elements.push(extractElementLayout(el, 'container', index));
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

    // Get full HTML for persistence - strip out injected scripts
    if (e.data.type === 'get-html') {
      // Clone the document to avoid modifying the live DOM
      var clone = document.documentElement.cloneNode(true);

      // Remove all injected edit mode elements
      var toRemove = clone.querySelectorAll('#ns-edit-mode-styles, script');
      toRemove.forEach(function(el) {
        // Only remove our injected scripts, not user scripts
        if (el.id === 'ns-edit-mode-styles' ||
            (el.textContent && el.textContent.includes('ns-custom-component-edit')) ||
            (el.textContent && el.textContent.includes('NEXTSLIDE EDIT MODE'))) {
          el.remove();
        }
      });

      // Remove ns- classes from elements
      clone.querySelectorAll('[class*="ns-"]').forEach(function(el) {
        // Handle SVG elements where className is SVGAnimatedString, not string
        var classStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
        var classes = classStr.split(' ').filter(function(c) {
          return !c.startsWith('ns-');
        });
        var newClass = classes.join(' ');
        if (typeof el.className === 'string') {
          el.className = newClass;
        } else if (el.className?.baseVal !== undefined) {
          el.className.baseVal = newClass;
        }
        if (!newClass) el.removeAttribute('class');
      });

      // Remove data-ns-id attributes
      clone.querySelectorAll('[data-ns-id]').forEach(function(el) {
        el.removeAttribute('data-ns-id');
      });

      var html = clone.outerHTML;
      sendToParent('html-response', { html: html });
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

    // Delete element
    if (e.data.type === 'delete-element') {
      const el = document.querySelector(e.data.selector);
      if (el) {
        el.remove();
        sendToParent('element-deleted', { elementId: e.data.elementId });
        // Request HTML update after deletion
        setTimeout(function() {
          sendToParent('get-html-request', {});
        }, 50);
      }
    }

    // Inject font into iframe
    if (e.data.type === 'inject-font') {
      var fontName = e.data.fontName;
      var fontSource = e.data.fontSource || 'google';
      var fontUrl = e.data.fontUrl;
      var fontFamily = e.data.fontFamily || fontName;
      var fontId = e.data.fontId;

      if (!fontName) return;

      // Clean font name
      var cleanFont = fontName.replace(/['"]/g, '').trim();
      if (!cleanFont) return;

      // Check if font already exists
      var existingStyle = document.querySelector('style[data-font="' + cleanFont + '"]');
      var existingLink = document.querySelector('link[data-font="' + cleanFont + '"]');
      if (existingStyle || existingLink) {
        console.log('[iframe] Font already loaded:', cleanFont);
        return;
      }

      console.log('[iframe] Injecting font:', { fontName: cleanFont, source: fontSource, url: fontUrl, id: fontId });

      if (fontSource === 'system') {
        // System fonts don't need loading
        console.log('[iframe] System font, no injection needed:', cleanFont);
        return;
      }

      if (fontSource === 'local' && fontUrl) {
        // Local font - inject @font-face rule
        var style = document.createElement('style');
        style.setAttribute('data-font', cleanFont);
        style.textContent = '@font-face { font-family: "' + fontFamily + '"; src: url("' + fontUrl + '"); font-display: swap; }';
        document.head.appendChild(style);
        console.log('[iframe] Local font injected:', cleanFont);
        return;
      }

      if (fontSource === 'fontshare') {
        // Fontshare font
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.setAttribute('data-font', cleanFont);
        link.href = 'https://api.fontshare.com/v2/css?f[]=' + encodeURIComponent(fontFamily || cleanFont) + '@300,400,500,600,700&display=swap';
        document.head.appendChild(link);
        console.log('[iframe] Fontshare font injected:', cleanFont);
        return;
      }

      if (fontSource === 'cdn' && fontUrl) {
        // CDN font
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.setAttribute('data-font', cleanFont);
        link.href = fontUrl;
        document.head.appendChild(link);
        console.log('[iframe] CDN font injected:', cleanFont);
        return;
      }

      if ((fontSource === 'designer' || fontSource === 'pixelbuddha') && fontId) {
        // Designer/PixelBuddha font - load via API endpoint
        var style = document.createElement('style');
        style.setAttribute('data-font', cleanFont);
        var apiUrl = '/api/fonts/file/' + encodeURIComponent(fontId) + '?style=regular';
        style.textContent = '@font-face { font-family: "' + fontFamily + '"; src: url("' + apiUrl + '"); font-display: swap; }';
        document.head.appendChild(style);
        console.log('[iframe] Font injected:', cleanFont, 'via', apiUrl);
        return;
      }

      if (fontId) {
        // Unknown source but has an ID - try the generic file endpoint
        var fallbackStyle = document.createElement('style');
        fallbackStyle.setAttribute('data-font', cleanFont);
        var fallbackUrl = '/api/fonts/file/' + encodeURIComponent(fontId) + '?style=regular';
        fallbackStyle.textContent = '@font-face { font-family: "' + fontFamily + '"; src: url("' + fallbackUrl + '"); font-display: swap; }';
        document.head.appendChild(fallbackStyle);
        console.log('[iframe] Font injected (fallback):', cleanFont, 'via', fallbackUrl);
        return;
      }

      // Default: Google Fonts
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('data-font', cleanFont);
      link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontFamily || cleanFont) + ':wght@300;400;500;600;700;800&display=swap';
      document.head.appendChild(link);
      console.log('[iframe] Google font injected:', cleanFont);
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
  onClickNested: (x: number, y: number) => void;
}> = ({ element, coordinator, iframeRef, onPositionChange, onDragEnd, onResizeChange, onResizeEnd, onDoubleClick, onClickNested }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  const { isDragging, dragOffset, handleDragStart } = useElementDrag({
    element,
    coordinator,
    iframeRef,
    overlayRef,
    onPositionChange,
    onDragEnd,
    onClickWithoutDrag: onClickNested,
  });

  const { isResizing, resizeDirection, resizeDelta, handleResizeStart } = useElementResize({
    element,
    coordinator,
    iframeRef,
    overlayRef,
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
      resizeDelta={resizeDelta}
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
  const [iframeBounds, setIframeBounds] = useState<DOMRect | null>(null);

  // Global store for sharing with settings panel
  const {
    setActiveComponent,
    setDetectedElements,
    setSelectedElement: setStoreSelectedElement,
    setIframeRef: setStoreIframeRef,
  } = useCustomComponentEditStore();

  // Refs
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef || internalIframeRef;
  const coordinatorRef = useRef<CoordinateTranslator | null>(null);

  // Track if this is the first element extraction (for auto-selecting closest element)
  const isFirstExtractionRef = useRef(true);
  // Track the last known cursor position for auto-selection
  const lastCursorPositionRef = useRef<{ x: number; y: number } | null>(null);

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

  // Track mouse position for auto-selecting closest element on first entry
  useEffect(() => {
    if (!isEditing || !isSelected) return;

    const handleMouseMove = (e: MouseEvent) => {
      lastCursorPositionRef.current = { x: e.clientX, y: e.clientY };
    };

    // Use capture phase to track position even before elements are extracted
    document.addEventListener('mousemove', handleMouseMove, true);
    return () => document.removeEventListener('mousemove', handleMouseMove, true);
  }, [isEditing, isSelected]);

  // Reset first extraction flag when entering edit mode
  useEffect(() => {
    if (isEditing && isSelected) {
      isFirstExtractionRef.current = true;
    }
  }, [isEditing, isSelected]);

  // Track iframe bounds for targeted deselection layer
  useEffect(() => {
    const updateBounds = () => {
      if (iframeRef.current) {
        setIframeBounds(iframeRef.current.getBoundingClientRect());
      }
    };
    updateBounds();
    // Update bounds on resize/scroll
    window.addEventListener('resize', updateBounds);
    window.addEventListener('scroll', updateBounds, true);
    return () => {
      window.removeEventListener('resize', updateBounds);
      window.removeEventListener('scroll', updateBounds, true);
    };
  }, [iframeRef, containerWidth, containerHeight, scale]);

  // Sync component ID and iframe ref to global store
  useEffect(() => {
    if (isEditing && isSelected) {
      setActiveComponent(componentId);
      setStoreIframeRef(iframeRef);
    }
  }, [componentId, isEditing, isSelected, iframeRef, setActiveComponent, setStoreIframeRef]);

  // Clear store when component unmounts or is deselected
  useEffect(() => {
    return () => {
      // Only clear if this component was the active one
      setActiveComponent(null);
      setDetectedElements([]);
      setStoreSelectedElement(null);
    };
  }, [setActiveComponent, setDetectedElements, setStoreSelectedElement]);

  // Sync selected element to global store
  useEffect(() => {
    setStoreSelectedElement(selectedElement);
  }, [selectedElement, setStoreSelectedElement]);

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
        // Update iframe bounds for hit area positioning
        if (iframeRef.current) {
          setIframeBounds(iframeRef.current.getBoundingClientRect());

          // Ensure coordinator exists and is up-to-date
          if (!coordinatorRef.current && containerWidth > 0) {
            coordinatorRef.current = createCoordinateTranslator(
              iframeRef.current,
              containerWidth,
              containerHeight
            );
          } else if (coordinatorRef.current) {
            coordinatorRef.current.update(iframeRef.current);
          }
        }

        const filteredElements = (data.elements as any[]).filter((el: any) => {
          const iframeBounds = el?.iframeBounds;
          if (!iframeBounds || el?.type !== 'container') return true;
          if (!containerWidth || !containerHeight) return true;
          const isCanvas =
            iframeBounds.width >= containerWidth * 0.98 &&
            iframeBounds.height >= containerHeight * 0.98;
          return !isCanvas;
        });

        // Convert iframe bounds to parent viewport bounds
        const elements: VirtualElement[] = filteredElements.map((el: any) => ({
          ...el,
          bounds: coordinatorRef.current
            ? coordinatorRef.current.iframeToParent(el.iframeBounds)
            : el.iframeBounds,
        }));

        setVirtualElements(elements);
        // Update global store for settings panel
        setDetectedElements(elements);

        // On first extraction, auto-select the element closest to the cursor position
        if (isFirstExtractionRef.current && elements.length > 0 && lastCursorPositionRef.current) {
          isFirstExtractionRef.current = false;

          const cursorX = lastCursorPositionRef.current.x;
          const cursorY = lastCursorPositionRef.current.y;

          // Find the element whose center is closest to the cursor
          let closestElement: VirtualElement | null = null;
          let closestDistance = Infinity;

          for (const el of elements) {
            // Calculate center of element
            const centerX = el.bounds.x + el.bounds.width / 2;
            const centerY = el.bounds.y + el.bounds.height / 2;

            // Calculate distance from cursor to center
            const distance = Math.sqrt(
              Math.pow(cursorX - centerX, 2) + Math.pow(cursorY - centerY, 2)
            );

            // Prefer smaller elements when distances are similar (within 50px)
            // This helps select nested elements over their containers
            const area = el.bounds.width * el.bounds.height;
            const adjustedDistance = distance + Math.log(area + 1) * 5;

            if (adjustedDistance < closestDistance) {
              closestDistance = adjustedDistance;
              closestElement = el;
            }
          }

          if (closestElement) {
            setSelectedElementId(closestElement.id);
            onElementSelect(toDetectedElement(closestElement), cursorX, cursorY);
          }
        }
      }

      // Legacy image-selected handler for ImageElementToolbar
      if (data.type === 'image-selected') {
        const el = virtualElements.find(e => e.id === data.element?.id);
        if (el) {
          setSelectedElementId(el.id);
          onElementSelect(toDetectedElement(el));
        }
      }

      // Handle text editing finished - save changes and re-enable hit areas
      if (data.type === 'text-changed') {
        setEditingTextId(null);

        // Request HTML from iframe to persist the text change
        // Use the event source window directly to ensure we reach the right iframe
        const sourceWindow = event.source as Window;
        if (sourceWindow) {
          setTimeout(() => {
            sourceWindow.postMessage({
              target: 'ns-custom-component-edit',
              type: 'get-html',
            }, '*');
          }, 50);
        } else if (iframeRef.current?.contentWindow) {
          // Fallback to iframeRef
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage({
              target: 'ns-custom-component-edit',
              type: 'get-html',
            }, '*');
          }, 50);
        }

        // Request fresh element data after text edit
        setTimeout(requestElements, 150);
      }

      // Handle HTML response for persistence
      if (data.type === 'html-response' && data.html) {
        onHtmlUpdate(data.html);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEditing, isSelected, componentId, iframeRef, requestElements, virtualElements, onElementSelect, onHtmlUpdate]);

  // Re-extract elements when srcDoc changes
  useEffect(() => {
    if (isReady && isEditing && isSelected) {
      const timeoutId = setTimeout(requestElements, 200);
      return () => clearTimeout(timeoutId);
    }
  }, [srcDoc, isReady, isEditing, isSelected, requestElements]);

  // Handle Delete key for inner element deletion (capture phase to intercept before global handler)
  useEffect(() => {
    if (!isEditing || !isSelected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace when an inner element is selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        // Don't handle if we're in text editing mode or in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        if (editingTextId) return;

        // Stop propagation to prevent global delete handler from deleting the whole component
        e.preventDefault();
        e.stopPropagation();


        // Delete the selected inner element
        const element = virtualElements.find(el => el.id === selectedElementId);
        if (element && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            target: 'ns-custom-component-edit',
            type: 'delete-element',
            selector: element.selector,
            elementId: element.id,
          }, '*');

          // Remove from local state
          setVirtualElements(prev => prev.filter(e => e.id !== selectedElementId));
          setSelectedElementId(null);
          onElementSelect(null);

          // Request HTML update for persistence
          setTimeout(() => {
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage({
                target: 'ns-custom-component-edit',
                type: 'get-html',
              }, '*');
            }
          }, 100);
        }
      }
    };

    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isEditing, isSelected, selectedElementId, editingTextId, virtualElements, iframeRef, onElementSelect]);

  // Handle element selection - single click selects (for drag), double-click edits (for text)
  const handleSelectElement = useCallback((elementId: string, cursorX?: number, cursorY?: number) => {
    const element = virtualElements.find(e => e.id === elementId);
    if (!element) {
      return;
    }

    // For ALL elements (including TEXT): show selection overlay on single click
    // This allows dragging text elements. Double-click will enter edit mode.
    setSelectedElementId(elementId);
    setEditingTextId(null);
    onElementSelect(toDetectedElement(element), cursorX, cursorY);

    // Notify iframe to clear any previous selection styling
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'deselect',
      }, '*');
    }
  }, [iframeRef, virtualElements, onElementSelect]);

  // Handle text edit - starts inline editing in the iframe
  const handleStartTextEdit = useCallback((element: VirtualElement) => {
    if (element.type !== 'text') return;

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'start-text-edit',
        selector: element.selector,
      }, '*');
    }
    // Hide selection overlay while editing text
    setSelectedElementId(null);
    setEditingTextId(element.id);
    onElementSelect(null);
  }, [iframeRef, onElementSelect]);

  // Handle double-click - for TEXT: enter edit mode, for IMAGE: open settings
  const handleDoubleClick = useCallback((element: VirtualElement) => {
    if (element.type === 'text') {
      handleStartTextEdit(element);
    } else if (element.type === 'image') {
      // Could open image settings or similar
      onElementSelect(toDetectedElement(element));
    }
  }, [handleStartTextEdit, onElementSelect]);

  // Handle click on nested element (when clicking inside selected element's bounds)
  const handleClickNested = useCallback((x: number, y: number) => {
    if (!selectedElement) return;

    // Find the smallest element at this position that's inside the selected element
    const selectedArea = selectedElement.bounds.width * selectedElement.bounds.height;

    let smallestElement: VirtualElement | null = null;
    let smallestArea = selectedArea;

    for (const el of virtualElements) {
      if (el.id === selectedElement.id) continue;

      // Check if click is inside this element's bounds
      const b = el.bounds;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        const area = b.width * b.height;
        // Only select if it's smaller than current selection
        if (area < smallestArea) {
          smallestElement = el;
          smallestArea = area;
        }
      }
    }

    if (smallestElement) {
      // Select the nested element
      handleSelectElement(smallestElement.id, x, y);
    }
  }, [selectedElement, virtualElements, handleSelectElement]);

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

    // First apply the final styles to ensure they're committed
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector: selectedElement.selector,
        styles,
      }, '*');
    }

    // Update virtual element bounds immediately - use our calculated bounds, don't re-extract
    setVirtualElements(prev => prev.map(e =>
      e.id === selectedElement.id
        ? {
            ...e,
            iframeBounds: newBounds,
            bounds: coordinatorRef.current?.iframeToParent(newBounds) || newBounds,
          }
        : e
    ));

    // Request HTML from iframe AFTER a short delay to ensure styles are applied
    setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'get-html',
        }, '*');
      }
    }, 50);

    // NOTE: We intentionally do NOT call requestElements here
    // We already have the correct bounds from our calculation
    // Re-extracting from iframe can cause position jumping due to CSS box model differences
  }, [selectedElement, iframeRef]);

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

    // First apply the final styles to ensure they're committed
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector: selectedElement.selector,
        styles,
      }, '*');
    }

    // Update virtual element bounds immediately - use our calculated bounds, don't re-extract
    setVirtualElements(prev => prev.map(e =>
      e.id === selectedElement.id
        ? {
            ...e,
            iframeBounds: newBounds,
            bounds: coordinatorRef.current?.iframeToParent(newBounds) || newBounds,
          }
        : e
    ));

    // Request HTML from iframe AFTER a short delay to ensure styles are applied
    setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          target: 'ns-custom-component-edit',
          type: 'get-html',
        }, '*');
      }
    }, 50);

    // NOTE: We intentionally do NOT call requestElements here
    // We already have the correct bounds from our calculation
  }, [selectedElement, iframeRef]);

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
    <div className="fixed inset-0" style={{ zIndex: 100, pointerEvents: 'none' }}>
      {/* Targeted deselection layer - ONLY covers the iframe area, not the entire viewport.
          This allows clicking on empty space in the slide to deselect, while clicks on
          the settings panel and other UI elements pass through normally.
          IMPORTANT: Don't render during text editing - the iframe needs to receive pointer events
          for contentEditable text input to work. */}
      {iframeBounds && !editingTextId && (
        <div
          style={{
            position: 'fixed',
            left: iframeBounds.left,
            top: iframeBounds.top,
            width: iframeBounds.width,
            height: iframeBounds.height,
            pointerEvents: 'auto',
            cursor: selectedElementId ? 'default' : 'crosshair',
            zIndex: 1, // Lower than hit areas (10000+) so elements are clickable
          }}
          onClick={(e) => {
            // Only deselect if clicking directly on background (not bubbled from children)
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
              setEditingTextId(null);
              onElementSelect(null);
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage({
                  target: 'ns-custom-component-edit',
                  type: 'deselect',
                }, '*');
              }
            }
          }}
        />
      )}

      {/* Element hit areas for click detection
          - Always visible EXCEPT the currently selected element
          - This allows clicking to select different elements while dragging the selected one
          - IMPORTANT: Wrapped in clipping container to prevent hit areas from extending into sidebar
          - z-index 30000 is BELOW selection overlay (40000) so drag/resize works */}
      {iframeBounds && (
        <div
          style={{
            position: 'fixed',
            left: iframeBounds.left,
            top: iframeBounds.top,
            width: iframeBounds.width,
            height: iframeBounds.height,
            overflow: 'hidden',
            pointerEvents: 'none', // Container doesn't receive events, children do
            zIndex: 30000, // BELOW selection overlay (40000) so drag works
          }}
        >
          {virtualElements.map(element => (
            <ElementHitArea
              key={element.id}
              element={{
                ...element,
                // Adjust bounds to be relative to the clipping container
                bounds: {
                  ...element.bounds,
                  x: element.bounds.x - iframeBounds.left,
                  y: element.bounds.y - iframeBounds.top,
                },
              }}
              isSelected={element.id === selectedElementId}
              onSelect={(cursorX, cursorY) => handleSelectElement(element.id, cursorX, cursorY)}
              onDoubleClick={() => handleDoubleClick(element)}
              disabled={!!editingTextId}
              hideForSelection={element.id === selectedElementId}
            />
          ))}
        </div>
      )}

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
          onClickNested={handleClickNested}
        />
      )}
    </div>,
    document.body
  );
};

export default CustomComponentEditOverlay;
