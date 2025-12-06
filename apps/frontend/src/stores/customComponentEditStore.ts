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

  // Send style update to iframe
  updateElementStyle: (selector: string, property: string, value: string) => void;

  // Send text update to iframe
  updateElementText: (elementId: string, newText: string) => void;

  // Send image update to iframe
  updateElementImage: (elementId: string, newSrc: string) => void;

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

  updateElementStyle: (selector, property, value) => {
    const { iframeRef } = get();
    if (iframeRef?.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'apply-style-mutation',
        selector,
        styles: { [property]: value },
      }, '*');
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

  clear: () => {
    set({
      activeComponentId: null,
      detectedElements: [],
      selectedElement: null,
      iframeRef: null,
    });
  },
}));
