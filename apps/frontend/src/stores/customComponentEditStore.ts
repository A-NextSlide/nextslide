/**
 * Custom Component Edit Store
 *
 * Manages state for editing elements inside custom components (HTML iframes).
 * This store is used to share data between the CustomComponentRenderer (overlay)
 * and the CustomComponentSettingsEditor (sidebar).
 */

import { create } from 'zustand';
import { VirtualElement } from '@/components/custom-component-editor/types';

interface CustomComponentEditState {
  // The component ID currently being edited
  activeComponentId: string | null;

  // All detected editable elements from the iframe
  detectedElements: VirtualElement[];

  // Currently selected element (clicked in overlay)
  selectedElement: VirtualElement | null;

  // Reference to the iframe for sending messages
  iframeRef: React.RefObject<HTMLIFrameElement> | null;

  // Actions
  setActiveComponent: (componentId: string | null) => void;
  setDetectedElements: (elements: VirtualElement[]) => void;
  setSelectedElement: (element: VirtualElement | null) => void;
  setIframeRef: (ref: React.RefObject<HTMLIFrameElement> | null) => void;

  // Select element by ID (for layers panel click)
  selectElementById: (elementId: string) => void;

  // Delete currently selected element
  deleteSelectedElement: () => void;

  // Reorder elements (change z-index) - moves element from fromIndex to toIndex
  reorderElements: (fromIndex: number, toIndex: number) => void;

  // Send style update to iframe
  updateElementStyle: (selector: string, property: string, value: string) => void;

  // Send text update to iframe
  updateElementText: (elementId: string, newText: string) => void;

  // Send image update to iframe
  updateElementImage: (elementId: string, newSrc: string) => void;

  // Inject font into iframe
  injectFont: (fontName: string, fontDef?: { source: string; url?: string; family?: string; id?: string }) => void;

  // Request HTML update from iframe for persistence
  requestHtmlUpdate: () => void;

  // Clear all state
  clear: () => void;
}

export const useCustomComponentEditStore = create<CustomComponentEditState>((set, get) => ({
  activeComponentId: null,
  detectedElements: [],
  selectedElement: null,
  iframeRef: null,

  setActiveComponent: (componentId) => {
    const current = get().activeComponentId;
    if (current !== componentId) {
      set({
        activeComponentId: componentId,
        detectedElements: [],
        selectedElement: null,
      });
    }
  },

  setDetectedElements: (elements) => {
    set({ detectedElements: elements });
  },

  setSelectedElement: (element) => {
    set({ selectedElement: element });
  },

  setIframeRef: (ref) => {
    set({ iframeRef: ref });
  },

  selectElementById: (elementId) => {
    const { detectedElements } = get();
    const element = detectedElements.find(e => e.id === elementId) || null;
    set({ selectedElement: element });
  },

  deleteSelectedElement: () => {
    const { selectedElement, iframeRef, detectedElements } = get();
    if (!selectedElement || !iframeRef?.current?.contentWindow) return;

    // Send delete command to iframe
    iframeRef.current.contentWindow.postMessage({
      target: 'ns-custom-component-edit',
      type: 'delete-element',
      selector: selectedElement.selector,
      elementId: selectedElement.id,
    }, '*');

    // Remove from local state
    set({
      selectedElement: null,
      detectedElements: detectedElements.filter(e => e.id !== selectedElement.id),
    });
  },

  reorderElements: (fromIndex, toIndex) => {
    const { detectedElements, iframeRef } = get();
    console.log('[Store] reorderElements called:', { fromIndex, toIndex, elementsCount: detectedElements.length });

    if (fromIndex < 0 || fromIndex >= detectedElements.length) return;
    if (toIndex < 0 || toIndex >= detectedElements.length) return;
    if (fromIndex === toIndex) return;

    // Create new array with reordered elements
    const newElements = [...detectedElements];
    const [movedElement] = newElements.splice(fromIndex, 1);
    newElements.splice(toIndex, 0, movedElement);

    console.log('[Store] Reordered elements, applying z-index changes...');

    // Update z-index in iframe for affected elements
    if (iframeRef?.current?.contentWindow) {
      // Higher index in array = higher z-index (appears on top)
      // Also add position: relative to ensure z-index works
      newElements.forEach((element, index) => {
        console.log('[Store] Setting z-index:', { selector: element.selector, zIndex: index + 1 });
        iframeRef.current?.contentWindow?.postMessage({
          target: 'ns-custom-component-edit',
          type: 'apply-style-mutation',
          selector: element.selector,
          styles: {
            zIndex: String(index + 1),
            position: 'relative' // z-index only works on positioned elements
          },
        }, '*');
      });

      // NOTE: We do NOT request HTML update here to avoid full iframe refresh
      // The z-index changes are applied directly to the iframe DOM
      // HTML will be persisted when user clicks Done/exits edit mode
    } else {
      console.warn('[Store] No iframeRef available for reorder!');
    }

    set({ detectedElements: newElements });
  },

  updateElementStyle: (selector, property, value) => {
    const { iframeRef } = get();
    console.log('[Store] updateElementStyle:', { selector, property, value });
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector,
        styles: { [property]: value },
      }, '*');
    } else {
      console.warn('[Store] No iframeRef for style update!');
    }
  },

  updateElementText: (elementId, newText) => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'update-text',
        elementId,
        newText,
      }, '*');
    }
  },

  updateElementImage: (elementId, newSrc) => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'update-image-with-placeholder',
        elementId,
        newSrc,
      }, '*');
    }
  },

  injectFont: (fontName, fontDef?: { source: string; url?: string; family?: string; id?: string }) => {
    const { iframeRef } = get();
    console.log('[Store] injectFont:', { fontName, fontDef, hasIframe: !!iframeRef?.current?.contentWindow });
    if (iframeRef?.current?.contentWindow && fontName) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'inject-font',
        fontName,
        fontSource: fontDef?.source,
        fontUrl: fontDef?.url,
        fontFamily: fontDef?.family || fontName,
        fontId: fontDef?.id,
      }, '*');
    }
  },

  requestHtmlUpdate: () => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'get-html',
      }, '*');
    }
  },

  clear: () => {
    set({
      activeComponentId: null,
      detectedElements: [],
      selectedElement: null,
      iframeRef: null,
    });
  },
}));
